"""API del vehículo IoT (Práctica 2.5): FastAPI + POO + Amazon RDS + WebSocket.

Ejecutar:  uvicorn app.main:app --reload --port 8000
Swagger:   http://localhost:8000/docs
"""
import logging

import pymysql
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.db.conexion import ErrorBaseDatos
from app.errores import ErrorNegocio
from app.rutas.demos import demos
from app.rutas.estado import estado, historial
from app.rutas.vehiculos import comandos, vehiculos
from app.rutas.ws import ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("api")

app = FastAPI(
    title="API Vehículo IoT",
    version="1.0.0",
    description=("API local (entorno Dev) para el vehículo IoT del esquema **vehiculo_iot** en Amazon RDS. "
                 "Integra los 21 Stored Procedures. Las operaciones de control, modificación y eliminación "
                 "requieren el encabezado `X-API-Key`.\n\n"
                 "**WebSocket** (no se muestra en Swagger, ver README): `ws://localhost:8000/ws/vehiculos/{id_vehiculo}`"),
    openapi_tags=[
        {"name": "Vehículos", "description": "sp_crear_vehiculo · sp_obtener_vehiculos · sp_obtener_vehiculo · sp_actualizar_vehiculo · sp_eliminar_vehiculo"},
        {"name": "Comandos", "description": "sp_crear_comando · sp_obtener_comandos_vehiculo · sp_actualizar_comando · sp_eliminar_comando"},
        {"name": "Estado", "description": "sp_actualizar_estado · sp_obtener_estado (movimiento individual)"},
        {"name": "Historial", "description": "sp_registrar_historial · sp_obtener_historial"},
        {"name": "DEMO", "description": "sp_crear_demo · sp_obtener_demos · sp_actualizar_demo · sp_eliminar_demo"},
        {"name": "Movimientos DEMO", "description": "sp_agregar_movimiento_demo · sp_obtener_movimientos_demo · sp_actualizar_movimiento_demo · sp_eliminar_movimiento_demo"},
        {"name": "Ejecución DEMO", "description": "Inicio y cancelación de DEMO transmitidas por WebSocket"},
    ],
)

for r in (vehiculos, comandos, estado, historial, demos, ws_router):
    app.include_router(r)


@app.get("/", tags=["Vehículos"], summary="Comprobar que la API responde")
def raiz():
    return {"api": "Vehículo IoT", "estado": "en línea", "docs": "http://localhost:8000/docs"}


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
