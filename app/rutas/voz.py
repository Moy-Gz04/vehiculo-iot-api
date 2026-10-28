"""Control por voz: convierte una frase en español en órdenes del catálogo usando Gemini.

El navegador transcribe la voz (Web Speech API) y manda solo el texto; aquí Gemini lo
interpreta y devuelve una lista de acciones con el nombre exacto del comando. La clave
de Gemini vive en el servidor (.env → GEMINI_API_KEY), nunca en la página.
"""
import asyncio
import json
import os
import ssl
import urllib.error
import urllib.request
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
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
    os.getenv("GEMINI_MODEL", "gemini-3.8-flash") + "," +
    os.getenv("GEMINI_MODELOS_RESPALDO", "gemini-3.8-flash-lite,gemini-flash-latest,gemini-flash-lite-latest")
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
