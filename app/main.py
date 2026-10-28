"""API del vehículo IoT (Práctica 2.5): FastAPI + POO + Amazon RDS + WebSocket.

Ejecutar:  uvicorn app.main:app --reload --port 8000
Swagger:   http://localhost:8000/docs
"""
import logging
from pathlib import Path

import pymysql
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.db.conexion import ErrorBaseDatos
from app.documentacion import DESCRIPCION, TAGS, pagina_docs
from app.errores import ErrorNegocio
from app.rutas.demos import demos
from app.rutas.estado import estado, historial
from app.rutas.portal import portal_api
from app.rutas.vehiculos import comandos, vehiculos
from app.rutas.voz import voz
from app.rutas.ws import ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("api")

app = FastAPI(
    title="API Vehículo IoT",
    version="1.0.0",
    description=DESCRIPCION,
    openapi_tags=TAGS,
    docs_url=None,
)


@app.get("/docs", include_in_schema=False)
def documentacion():
    return pagina_docs(app.openapi_url, app.title)

for r in (vehiculos, comandos, estado, historial, demos, voz, ws_router, portal_api):
    app.include_router(r)

# Portal del proyecto (API, simulador, control y guía del examen) y control remoto web, mismo origen que la API
app.mount("/portal", StaticFiles(directory=Path(__file__).parent / "web" / "portal", html=True), name="portal")
app.mount("/control", StaticFiles(directory=Path(__file__).parent / "web", html=True), name="control")


@app.middleware("http")
async def sin_cache_web(request: Request, call_next):
    """El portal, el control y el simulador se revisan en cada visita: así una versión nueva
    aparece al recargar, sin que el navegador siga mostrando la copia que guardó."""
    respuesta = await call_next(request)
    if request.url.path.startswith(("/control", "/portal")) and not request.url.path.startswith("/portal/api"):
        respuesta.headers["Cache-Control"] = "no-cache"
    return respuesta


@app.get("/control", include_in_schema=False)
def control():
    return RedirectResponse("/control/")


@app.get("/portal", include_in_schema=False)
def portal():
    return RedirectResponse("/portal/")


@app.get("/", tags=["Sistema"], summary="Comprobar que la API responde")
def raiz():
    return {"api": "Vehículo IoT", "estado": "en línea", "docs": "http://localhost:8000/docs", "control": "http://localhost:8000/control/"}


@app.exception_handler(ErrorNegocio)
async def _negocio(_: Request, e: ErrorNegocio):
    return JSONResponse(status_code=e.codigo_http, content={"detail": e.mensaje})


@app.exception_handler(pymysql.IntegrityError)
async def _integridad(_: Request, e: pymysql.IntegrityError):
    # 1062 = duplicado, 1451/1452 = relación con otros registros
    msg = {1062: "Ya existe un registro con ese nombre, código u orden",
           1451: "No se puede eliminar: otros registros lo utilizan (p. ej. una DEMO usa este comando)"}
    return JSONResponse(status_code=409, content={"detail": msg.get(e.args[0], "Conflicto con datos existentes")})


@app.exception_handler(ErrorBaseDatos)
@app.exception_handler(pymysql.OperationalError)
async def _rds(_: Request, e: Exception):
    log.error("Fallo de base de datos: %s", type(e).__name__)
    return JSONResponse(status_code=503, content={"detail": "Amazon RDS no está disponible en este momento"})


@app.exception_handler(pymysql.MySQLError)
async def _mysql(_: Request, e: pymysql.MySQLError):
    log.error("Error MySQL %s", e.args[0] if e.args else "")
    return JSONResponse(status_code=500, content={"detail": "Error interno al ejecutar el procedimiento"})
