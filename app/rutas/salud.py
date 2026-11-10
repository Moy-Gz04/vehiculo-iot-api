"""Rutas de salud: disponibilidad de la API y diagnóstico seguro de Amazon RDS.

Las usa el frontend de CONTROL (GitHub Pages) para sus indicadores:
- GET /salud      -> la API responde (no toca la base de datos).
- GET /salud/rds  -> ejecuta una consulta mínima en RDS y dice si respondió.
Ninguna expone credenciales, host ni datos de la base.
"""
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.dependencias import app_ctx

salud = APIRouter(prefix="/salud", tags=["Sistema"])


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


@salud.get("", summary="Disponibilidad de la API (sin consultar la base de datos)")
def salud_api(request: Request):
    """Responde mientras el servidor de AWS y FastAPI estén en línea.
    No garantiza que todas las operaciones funcionen ni que el vehículo esté conectado."""
    rutas = request.app.openapi().get("paths", {})
    servicios = sum(len(ops) for ruta, ops in rutas.items()
                    if not ruta.startswith(("/salud", "/portal")) and ruta != "/")
    return {"api": "disponible", "servicios": servicios, "timestamp": _ahora()}


@salud.get("/rds", summary="Diagnóstico seguro de Amazon RDS (consulta mínima SELECT 1)",
           responses={503: {"description": "Amazon RDS no respondió"}})
def salud_rds():
    t0 = time.perf_counter()
    try:
        app_ctx.repo.db.consulta("SELECT 1 AS ok")
    except Exception as e:  # noqa: BLE001 — se informa el estado, no la traza
        return JSONResponse(status_code=503, content={
            "rds": "no disponible", "error": type(e).__name__, "timestamp": _ahora()})
    return {"rds": "disponible", "latencia_ms": round((time.perf_counter() - t0) * 1000, 1), "timestamp": _ahora()}
