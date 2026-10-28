"""Control por voz: convierte una frase en español en órdenes del catálogo usando Gemini.

El navegador transcribe la voz (Web Speech API) y manda solo el texto; aquí Gemini lo
interpreta y devuelve una lista de acciones con el nombre exacto del comando. La clave
de Gemini vive en el servidor (.env → GEMINI_API_KEY), nunca en la página.
"""
import asyncio
import base64
import hashlib
import io
import json
import wave
import os
import re
import ssl
import urllib.error
import urllib.request
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.dependencias import requiere_api_key

voz = APIRouter(prefix="/voz", tags=["Voz"])

# Windows en EC2 no siempre tiene los certificados raíz de Google: se usa el paquete certifi si está.
try:
    import certifi
    CONTEXTO_SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CONTEXTO_SSL = ssl.create_default_context()

# Primero el modelo del .env; si está saturado (503/429) o no existe (404), prueba los siguientes.
MODELOS = list(dict.fromkeys(m.strip() for m in (
    os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite") + "," +
    os.getenv("GEMINI_MODELOS_RESPALDO", "gemini-3.8-flash,gemini-3.6-flash,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-flash-latest")
).split(",") if m.strip()))
REINTENTABLES = {404, 429, 500, 503}
URL = "https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"

INSTRUCCIONES = """Eres el intérprete de voz de una retroexcavadora a control remoto.
Recibes lo que dijo el operador (español de México, puede venir con errores de transcripción)
y lo traduces a acciones usando SOLO estos comandos:
AVANZAR, RETROCEDER, GIRAR_IZQUIERDA, GIRAR_DERECHA (la oruga/el carro gira),
SUBIR_BRAZO, BAJAR_BRAZO (brazo o pala), ROTAR_IZQUIERDA, ROTAR_DERECHA (la cabina/la torre da vuelta),
ENCENDER (prender o apagar), LUCES, SONIDO (claxon, pitar), DEMO_FISICA (demo, baila, muéstrate),
DETENER (alto, para, frena, quieto).
Reglas:
- Devuelve las acciones en el orden en que se pidieron.
- "segundos": si dijo una duración ("tres segundos", "un poquito" = 1, "un rato" = 3), úsala; si no, 0
  (0 = sigue hasta la siguiente orden). Para ENCENDER, LUCES, SONIDO, DEMO_FISICA y DETENER usa 0.
- Si la frase no es una orden para la máquina, devuelve acciones vacías.
- "respuesta": frase muy corta en español para mostrar al operador (máx. 40 caracteres)."""

ESQUEMA = {
    "type": "OBJECT",
    "properties": {
        "acciones": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "comando": {"type": "STRING", "enum": [
                "AVANZAR", "RETROCEDER", "GIRAR_IZQUIERDA", "GIRAR_DERECHA", "SUBIR_BRAZO", "BAJAR_BRAZO",
                "ROTAR_IZQUIERDA", "ROTAR_DERECHA", "ENCENDER", "LUCES", "SONIDO", "DEMO_FISICA", "DETENER"]},
            "segundos": {"type": "NUMBER"}}, "required": ["comando", "segundos"]}},
        "respuesta": {"type": "STRING"},
    },
    "required": ["acciones", "respuesta"],
}


class FraseVoz(BaseModel):
    texto: str = Field(min_length=1, max_length=300, examples=["avanza tres segundos y luego sube el brazo"])


class AccionVoz(BaseModel):
    comando: str
    segundos: float = 0


class InterpretacionVoz(BaseModel):
    texto: str
    acciones: list[AccionVoz]
    respuesta: str
    motor: str
    detalle: Optional[str] = None


def _preguntar_gemini(texto: str, clave: str, modelo: str) -> dict:
    cuerpo = {
        "systemInstruction": {"parts": [{"text": INSTRUCCIONES}]},
        "contents": [{"role": "user", "parts": [{"text": texto}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": ESQUEMA},
    }
    req = urllib.request.Request(URL.format(modelo=modelo), data=json.dumps(cuerpo).encode(),
                                 headers={"Content-Type": "application/json", "x-goog-api-key": clave})
    with urllib.request.urlopen(req, timeout=8, context=CONTEXTO_SSL) as r:
        datos = json.load(r)
    return json.loads(datos["candidates"][0]["content"]["parts"][0]["text"])


@voz.post("/interpretar", response_model=InterpretacionVoz, dependencies=[Depends(requiere_api_key)],
          summary="Interpretar una orden de voz",
          description="Recibe el texto que dijo el operador y devuelve las acciones del catálogo (Gemini). "
                      "No mueve el vehículo: el control web ejecuta las acciones con `/movimientos` o el WebSocket.")
async def interpretar(frase: FraseVoz):
    clave = os.getenv("GEMINI_API_KEY", "")
    if not clave:
        raise HTTPException(503, "Falta GEMINI_API_KEY en el .env del servidor")
    r, usado, ultimo_error = None, "", ""
    for modelo in MODELOS:
        try:
            r = await asyncio.to_thread(_preguntar_gemini, frase.texto, clave, modelo)
            usado = modelo
            break
        except urllib.error.HTTPError as ex:
            ultimo_error = f"{modelo} respondió {ex.code}"
            if ex.code not in REINTENTABLES:      # clave inválida, petición mal formada: no tiene caso seguir
                raise HTTPException(502, f"Gemini {ultimo_error}: {ex.read().decode(errors='replace')[:200]}")
        except Exception as ex:  # red caída, tiempo agotado o respuesta inesperada
            ultimo_error = f"{modelo}: {ex}"
    if r is None:
        raise HTTPException(503, f"Gemini ocupado ({ultimo_error}). Se usó el intérprete local.")
    acciones = [AccionVoz(comando=a["comando"], segundos=max(0, min(float(a.get("segundos") or 0), 30)))
                for a in r.get("acciones", [])][:6]
    return InterpretacionVoz(texto=frase.texto, acciones=acciones, respuesta=r.get("respuesta", "")[:60], motor=usado)



# ---------------------------------------------------------------------------
#  Voz de Demon con IA (Gemini TTS). Devuelve un WAV; las frases se guardan en
#  caché en memoria porque Demon repite casi siempre las mismas.
# ---------------------------------------------------------------------------
MODELOS_TTS = list(dict.fromkeys(m.strip() for m in os.getenv(
    "GEMINI_TTS_MODELOS", "gemini-3.8-flash-tts,gemini-2.5-flash-preview-tts,gemini-3.1-flash-tts-preview").split(",") if m.strip()))
VOCES_TTS = ["Puck", "Fenrir", "Charon", "Orus", "Algenib", "Achird", "Zubenelgenubi", "Kore", "Aoede", "Leda", "Zephyr", "Sulafat"]
_cache_audio: dict[str, bytes] = {}
# Caché en disco: cada frase se genera una sola vez (la cuota gratis de voz es de pocas peticiones por minuto)
from pathlib import Path
CARPETA_AUDIO = Path(__file__).resolve().parent.parent / "cache_voz"
CARPETA_AUDIO.mkdir(exist_ok=True)


class FraseHablar(BaseModel):
    texto: str = Field(min_length=1, max_length=300, examples=["Hola, soy Demon"])
    voz: str = Field("Puck", max_length=30)


def _a_wav(pcm: bytes, frecuencia: int = 24000) -> bytes:
    """Gemini entrega PCM de 16 bits mono; se envuelve en WAV para que el navegador lo reproduzca."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(frecuencia); w.writeframes(pcm)
    return buf.getvalue()


def _sintetizar(texto: str, voz: str, clave: str, modelo: str) -> bytes:
    cuerpo = {
        "contents": [{"parts": [{"text": texto}]}],   # solo la frase: si se agrega una instrucción, a veces la lee en voz alta
        "generationConfig": {"responseModalities": ["AUDIO"],
                             "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz}}}},
    }
    req = urllib.request.Request(URL.format(modelo=modelo), data=json.dumps(cuerpo).encode(),
                                 headers={"Content-Type": "application/json", "x-goog-api-key": clave})
    with urllib.request.urlopen(req, timeout=20, context=CONTEXTO_SSL) as r:
        datos = json.load(r)
    parte = datos["candidates"][0]["content"]["parts"][0]["inlineData"]
    m = re.search(r"rate=(\d+)", parte.get("mimeType", ""))
    return _a_wav(base64.b64decode(parte["data"]), int(m.group(1)) if m else 24000)


@voz.get("/voces", summary="Voces IA disponibles para Demon")
def voces():
    return {"voces": VOCES_TTS, "modelos": MODELOS_TTS}


@voz.post("/hablar", dependencies=[Depends(requiere_api_key)], response_class=Response,
          summary="Convertir texto en voz (Gemini TTS)",
          description="Devuelve `audio/wav`. Las frases repetidas salen de caché al instante.")
async def hablar(frase: FraseHablar):
    clave = os.getenv("GEMINI_API_KEY", "")
    if not clave:
        raise HTTPException(503, "Falta GEMINI_API_KEY en el .env del servidor")
    voz_elegida = frase.voz if frase.voz in VOCES_TTS else "Puck"
    llave = hashlib.sha1(f"v2|{voz_elegida}|{frase.texto}".encode()).hexdigest()
    archivo = CARPETA_AUDIO / f"{llave}.wav"
    if llave not in _cache_audio and archivo.exists():
        _cache_audio[llave] = archivo.read_bytes()
    if llave not in _cache_audio:
        ultimo = ""
        for modelo in MODELOS_TTS:
            try:
                _cache_audio[llave] = await asyncio.to_thread(_sintetizar, frase.texto, voz_elegida, clave, modelo)
                archivo.write_bytes(_cache_audio[llave])
                break
            except urllib.error.HTTPError as ex:
                ultimo = f"{modelo} respondió {ex.code}"
            except Exception as ex:
                ultimo = f"{modelo}: {ex}"
        else:
            raise HTTPException(503, f"No se pudo generar la voz ({ultimo})")
        if len(_cache_audio) > 300:
            _cache_audio.pop(next(iter(_cache_audio)))
    return Response(_cache_audio[llave], media_type="audio/wav", headers={"Cache-Control": "private, max-age=86400"})
