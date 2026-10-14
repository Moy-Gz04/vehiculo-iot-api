"""Endpoints de estado, historial y movimiento individual."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException

from app.dependencias import app_ctx, requiere_api_key
from app.modelos import esquemas as e
from app.rutas.vehiculos import AUT, ERR, IdV

estado = APIRouter(prefix="/vehiculos/{id_vehiculo}", tags=["Estado"])
historial = APIRouter(prefix="/vehiculos/{id_vehiculo}", tags=["Historial"])


@estado.get("/estado", response_model=e.Estado, responses=ERR,
            summary="Último estado del vehículo", description="**SP:** `sp_obtener_estado`")
def obtener_estado(id_vehiculo: int = IdV):
    est = app_ctx.estado.obtener(id_vehiculo)
    if est is None:
        raise HTTPException(404, "El vehículo existe pero aún no tiene estado registrado")
    return est


@estado.post("/movimientos", response_model=e.ResultadoMovimiento, responses={**ERR, **AUT},
             dependencies=[Depends(requiere_api_key)],
             summary="Ejecutar un movimiento individual",
             description=("Valida vehículo y comando (existentes, activos y del mismo vehículo) y en **una transacción** llama a "
                          "`sp_actualizar_estado` + `sp_registrar_historial`. Tras el commit notifica por WebSocket "
                          "(evento `movimiento`). Si se rechaza, no cambia el estado ni el historial.\n\n"
                          "**SP:** `sp_obtener_vehiculo`, `sp_obtener_comandos_vehiculo`, `sp_obtener_estado`, "
                          "`sp_actualizar_estado`, `sp_registrar_historial`"))
async def ejecutar_movimiento(datos: e.MovimientoIndividual, id_vehiculo: int = IdV):
    r = await asyncio.to_thread(app_ctx.movimientos.ejecutar, id_vehiculo, datos.id_comando, datos.origen)
    c = r["comando"]
    notificados = await app_ctx.ws.publicar(id_vehiculo, app_ctx.ws.evento(
        "movimiento", id_vehiculo, id_comando=c["id_comando"], comando=c["nombre"], codigo=c["codigo"],
        origen=datos.origen, modo=datos.modo))
    return {"mensaje": "Movimiento registrado", "id_vehiculo": id_vehiculo, "id_comando": c["id_comando"],
            "comando": c["nombre"], "codigo": c["codigo"], "origen": datos.origen,
            "estado": r["estado"], "clientes_notificados": notificados}


@estado.post("/mantener", response_model=e.Mensaje, responses={**AUT},
             dependencies=[Depends(requiere_api_key)],
             summary="Aviso: el botón sigue presionado",
             description=("Para el modo **mantener**: el control lo envía cada ~0.4 s mientras el botón está presionado. "
                          "Solo se transmite por WebSocket (evento `mantener`); **no** toca la base de datos ni el historial. "
                          "Si el vehículo deja de recibirlo, se detiene solo."))
async def mantener(id_vehiculo: int = IdV):
    await app_ctx.ws.publicar(id_vehiculo, app_ctx.ws.evento("mantener", id_vehiculo))
    return {"mensaje": "ok"}


@estado.post("/soltar", response_model=e.Mensaje, responses={**AUT},
             dependencies=[Depends(requiere_api_key)],
             summary="Aviso: se soltó el botón",
             description=("Detiene de inmediato el movimiento en curso (evento WebSocket `soltar`) sin registrar nada en el "
                          "historial. También sirve para comprobar que la X-API-Key es válida."))
async def soltar(id_vehiculo: int = IdV):
    await app_ctx.ws.publicar(id_vehiculo, app_ctx.ws.evento("soltar", id_vehiculo))
    return {"mensaje": "ok"}


@historial.get("/historial", response_model=e.Historial, responses=ERR,
               summary="Últimos 10 movimientos individuales",
               description=("Devuelve **como máximo 10** movimientos individuales, del más reciente al más antiguo. "
                            "Si hay menos, devuelve solo los disponibles. Los movimientos de DEMO nunca aparecen aquí.\n\n"
                            "**SP:** `sp_obtener_historial`"))
def obtener_historial(id_vehiculo: int = IdV):
    return app_ctx.historial.ultimos(id_vehiculo)
