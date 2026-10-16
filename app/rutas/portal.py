"""Portal del proyecto: datos de diagnóstico que la web /portal/ usa para comprobar cada criterio en vivo.

Todo es de solo lectura. No expone credenciales: el host de RDS se muestra enmascarado y el .env nunca se lee.
"""
import ast
import ipaddress
import platform
import socket
import sys
import time
from importlib import metadata
from pathlib import Path

from fastapi import APIRouter, Request

from app.config import configuracion
from app.db.conexion import uso_sp
from app.dependencias import app_ctx

portal_api = APIRouter(prefix="/portal/api", include_in_schema=False)

RAIZ = Path(__file__).resolve().parents[2]
INICIO = time.time()

# SP → (grupo, endpoint que lo usa)
MAPA_SP = {
    "sp_crear_vehiculo": ("Vehículos", "POST /vehiculos"),
    "sp_obtener_vehiculos": ("Vehículos", "GET /vehiculos"),
    "sp_obtener_vehiculo": ("Vehículos", "GET /vehiculos/{id}"),
    "sp_actualizar_vehiculo": ("Vehículos", "POST /vehiculos/{id}/actualizar"),
    "sp_eliminar_vehiculo": ("Vehículos", "POST /vehiculos/{id}/eliminar"),
    "sp_crear_comando": ("Comandos", "POST /vehiculos/{id}/comandos"),
    "sp_obtener_comandos_vehiculo": ("Comandos", "GET /vehiculos/{id}/comandos"),
    "sp_actualizar_comando": ("Comandos", "POST /vehiculos/{id}/comandos/{id_comando}/actualizar"),
    "sp_eliminar_comando": ("Comandos", "POST /vehiculos/{id}/comandos/{id_comando}/eliminar"),
    "sp_obtener_estado": ("Estado", "GET /vehiculos/{id}/estado"),
    "sp_actualizar_estado": ("Estado", "POST /vehiculos/{id}/movimientos · DEMO"),
    "sp_registrar_historial": ("Historial", "POST /vehiculos/{id}/movimientos"),
    "sp_obtener_historial": ("Historial", "GET /vehiculos/{id}/historial"),
    "sp_crear_demo": ("DEMO", "POST /vehiculos/{id}/demos"),
    "sp_obtener_demos": ("DEMO", "GET /vehiculos/{id}/demos"),
    "sp_actualizar_demo": ("DEMO", "POST /vehiculos/{id}/demos/{id_demo}/actualizar"),
    "sp_eliminar_demo": ("DEMO", "POST /vehiculos/{id}/demos/{id_demo}/eliminar"),
    "sp_agregar_movimiento_demo": ("Movimientos DEMO", "POST /vehiculos/{id}/demos/{id_demo}/movimientos"),
    "sp_obtener_movimientos_demo": ("Movimientos DEMO", "GET /vehiculos/{id}/demos/{id_demo}/movimientos · iniciar"),
    "sp_actualizar_movimiento_demo": ("Movimientos DEMO", "POST …/movimientos/{id_mov}/actualizar"),
    "sp_eliminar_movimiento_demo": ("Movimientos DEMO", "POST …/movimientos/{id_mov}/eliminar"),
}


def _archivos_codigo() -> list[Path]:
    """Código que se puede mostrar: módulos Python, dependencias, README y scripts de despliegue. Nunca el .env."""
    rutas = sorted((RAIZ / "app").rglob("*.py"))
    rutas += [RAIZ / n for n in ("requirements.txt", "README.md", ".env.example", ".gitignore")]
    rutas += sorted((RAIZ / "deploy").glob("*.ps1"))
    return [p for p in rutas if p.is_file() and p.name != ".env" and "__pycache__" not in p.parts]


def _version(paquete: str) -> str:
    try:
        return metadata.version(paquete)
    except metadata.PackageNotFoundError:
        return "—"


@portal_api.get("/sistema")
def sistema(request: Request):
    req = RAIZ / "requirements.txt"
    deps = []
    for linea in req.read_text(encoding="utf-8").splitlines() if req.exists() else []:
        if "==" in linea:
            nombre, fijada = linea.strip().split("==", 1)
            deps.append({"paquete": nombre, "requerida": fijada, "instalada": _version(nombre)})
    return {
        "python": platform.python_version(),
        "implementacion": platform.python_implementation(),
        "sistema": f"{platform.system()} {platform.release()}",
        "servidor": socket.gethostname(),
        "dependencias": deps,
        "inicio": INICIO,
        "uptime_s": int(time.time() - INICIO),
        "protocolo": request.headers.get("x-forwarded-proto", request.url.scheme),
        "host": request.headers.get("host", ""),
        "clientes_ws": {v: n for v, s in list(app_ctx.ws._clientes.items()) if (n := len(s))},
        "rutas": len([r for r in request.app.routes if getattr(r, "include_in_schema", False)]),
    }


@portal_api.get("/codigo")
def codigo():
    archivos = []
    for p in _archivos_codigo():
        txt = p.read_text(encoding="utf-8", errors="replace")
        archivos.append({"ruta": p.relative_to(RAIZ).as_posix(), "lineas": txt.count("\n") + 1, "contenido": txt})
    return archivos


@portal_api.get("/poo")
def poo():
    modulos = []
    for p in sorted((RAIZ / "app").rglob("*.py")):
        if "__pycache__" in p.parts or p.name == "__init__.py":
            continue
        fuente = p.read_text(encoding="utf-8")
        arbol = ast.parse(fuente)

        def detalle(f):
            """Nombre, línea y código fuente exacto de una función o método."""
            dec = f.decorator_list[0].lineno if f.decorator_list else f.lineno
            lineas = fuente.splitlines()[dec - 1:f.end_lineno]
            return {"nombre": f.name, "linea": dec, "codigo": "\n".join(lineas),
                    "doc": (ast.get_docstring(f) or "").split("\n")[0]}

        clases = []
        for n in arbol.body:
            if isinstance(n, ast.ClassDef):
                funcs = [m for m in n.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))]
                clases.append({
                    "nombre": n.name,
                    "bases": [ast.unparse(b) for b in n.bases],
                    "doc": (ast.get_docstring(n) or "").split("\n")[0],
                    "linea": n.lineno,
                    "metodos": [m.name for m in funcs],
                    "detalle": [detalle(m) for m in funcs],
                })
        importa = sorted({(n.module or "").split(".")[1] for n in ast.walk(arbol)
                          if isinstance(n, ast.ImportFrom) and (n.module or "").startswith("app.") and len((n.module or "").split(".")) > 1})
        modulos.append({
            "modulo": p.relative_to(RAIZ).as_posix(),
            "doc": (ast.get_docstring(arbol) or "").split("\n")[0],
            "clases": clases,
            "funciones": [n.name for n in arbol.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))],
            "funciones_detalle": [detalle(n) for n in arbol.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))],
            "importa": importa,
        })
    return modulos


def _host_enmascarado(host: str) -> str:
    partes = host.split(".")
    if len(partes) > 3:
        partes[1] = "•" * 8
    return ".".join(partes)


@portal_api.get("/rds")
def rds():
    db = app_ctx.repo.db
    host = configuracion.db_host
    try:
        ip = socket.gethostbyname(host)
        privada = ipaddress.ip_address(ip).is_private
    except OSError:
        ip, privada = None, None
    t0 = time.perf_counter()
    try:
        info = db.consulta("SELECT VERSION() AS version, @@version_comment AS edicion, DATABASE() AS base, NOW() AS ahora")[0]
        latencia = round((time.perf_counter() - t0) * 1000, 1)
        nombres = [f["t"] for f in db.consulta(
            "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME")]
        tablas = []
        for t in nombres:  # los nombres vienen de information_schema, no del usuario
            tablas.append({"tabla": t, "filas": db.consulta(f"SELECT COUNT(*) AS n FROM `{t}`")[0]["n"]})
    except Exception as e:  # noqa: BLE001 — se informa al portal en vez de romper
        return {"conectado": False, "error": type(e).__name__, "host": _host_enmascarado(host)}
    return {
        "conectado": True,
        "host": _host_enmascarado(host),
        "es_rds": host.endswith(".rds.amazonaws.com"),
        "region": host.split(".")[2] if host.endswith(".rds.amazonaws.com") else None,
        "ip_privada": privada,
        "version": info["version"],
        "edicion": info["edicion"],
        "base": info["base"],
        "hora_servidor": str(info["ahora"]),
        "latencia_ms": latencia,
        "tablas": tablas,
    }


@portal_api.get("/sp")
def procedimientos():
    db = app_ctx.repo.db
    rutinas = db.consulta(
        "SELECT ROUTINE_NAME AS n, CREATED AS creado FROM information_schema.ROUTINES "
        "WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME")
    params = db.consulta(
        "SELECT SPECIFIC_NAME AS n, PARAMETER_MODE AS modo, PARAMETER_NAME AS p, DATA_TYPE AS tipo "
        "FROM information_schema.PARAMETERS WHERE SPECIFIC_SCHEMA = DATABASE() AND PARAMETER_NAME IS NOT NULL "
        "ORDER BY SPECIFIC_NAME, ORDINAL_POSITION")
    por_sp: dict[str, list] = {}
    for p in params:
        por_sp.setdefault(p["n"], []).append(f'{p["modo"] or "IN"} {p["p"]} {p["tipo"]}')
    salida = []
    for r in rutinas:
        grupo, endpoint = MAPA_SP.get(r["n"], ("Otro", "—"))
        salida.append({
            "sp": r["n"], "grupo": grupo, "endpoint": endpoint,
            "parametros": por_sp.get(r["n"], []),
            "llamadas": uso_sp.llamadas.get(r["n"], 0),
            "ultima": uso_sp.ultima.get(r["n"]),
        })
    return {"total": len(salida), "esperados": len(MAPA_SP), "procedimientos": salida, "desde": INICIO}
