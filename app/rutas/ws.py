"""WebSocket de monitoreo por vehículo: ws://localhost:8000/ws/vehiculos/{id_vehiculo}"""
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.dependencias import app_ctx
from app.errores import ErrorNegocio

ws_router = APIRouter()


@ws_router.websocket("/ws/vehiculos/{id_vehiculo}")
async def monitorear(ws: WebSocket, id_vehiculo: int):
    gestor = app_ctx.ws
    try:
        await asyncio.to_thread(app_ctx.vehiculos.obtener, id_vehiculo)
    except ErrorNegocio as e:
        await ws.accept()
        await ws.send_json(gestor.evento("error", id_vehiculo, detalle=e.mensaje))
        await ws.close(code=4404)
        return
    await gestor.conectar(id_vehiculo, ws)
    try:
        # Al abrir: último estado guardado en RDS
        est = await asyncio.to_thread(app_ctx.repo.obtener_estado, id_vehiculo)
        await ws.send_json(gestor.evento(
            "estado_actual", id_vehiculo, id_comando=est and est["id_comando"], comando=est and est["comando"],
            codigo=est and est["codigo"], conectado=bool(est and est["conectado"]),
            fecha_actualizacion=est and est["fecha_actualizacion"].isoformat(),
            demo_en_curso=app_ctx.ejecutor.en_curso(id_vehiculo), clientes=gestor.clientes(id_vehiculo)))
        # Mantiene la conexión; responde "ping" para comprobar que sigue viva
        while True:
            texto = await ws.receive_text()
            if texto.strip().lower() == "ping":
                await ws.send_json(gestor.evento("pong", id_vehiculo))
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await ws.send_json(gestor.evento("error", id_vehiculo, detalle="No se pudo consultar el estado en RDS"))
        except Exception:
            pass
    finally:
        await gestor.desconectar(id_vehiculo, ws)
