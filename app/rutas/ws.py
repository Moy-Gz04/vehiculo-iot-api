"""WebSocket de monitoreo por vehículo: ws://localhost:8000/ws/vehiculos/{id_vehiculo}"""
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import configuracion
from app.dependencias import app_ctx
from app.errores import ErrorNegocio
from app.rutas.estado import mover_y_notificar

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
        # Mantiene la conexión; responde "ping" y reenvía los avisos rápidos del control
        # {"accion": "mantener" | "soltar", "clave": "<X-API-Key>"}  (no tocan la base de datos)
        while True:
            texto = await ws.receive_text()
            if texto.strip().lower() == "ping":
                await ws.send_json(gestor.evento("pong", id_vehiculo))
                continue
            try:
                msg = json.loads(texto)
            except ValueError:
                continue
            if not isinstance(msg, dict) or msg.get("clave") != configuracion.api_key:
                continue
            if msg.get("accion") in ("mantener", "soltar"):
                await gestor.publicar(id_vehiculo, gestor.evento(msg["accion"], id_vehiculo))
            elif msg.get("accion") == "mover":
                # Movimiento por la conexión ya abierta (sin el costo de una petición HTTP):
                # mismas validaciones y la misma transacción que POST /movimientos.
                try:
                    id_comando = int(msg.get("id_comando"))
                    origen = str(msg.get("origen") or "WEB-CONTROL")[:30]
                    modo = msg.get("modo") if msg.get("modo") in ("toque", "continuo", "mantener") else "toque"
                    await mover_y_notificar(id_vehiculo, id_comando, origen, modo)
                except ErrorNegocio as e:
                    await ws.send_json(gestor.evento("error", id_vehiculo, detalle=e.mensaje))
                except (TypeError, ValueError):
                    await ws.send_json(gestor.evento("error", id_vehiculo, detalle="id_comando no válido"))
                except Exception:
                    await ws.send_json(gestor.evento("error", id_vehiculo, detalle="No se pudo guardar el movimiento en RDS"))
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await ws.send_json(gestor.evento("error", id_vehiculo, detalle="No se pudo consultar el estado en RDS"))
        except Exception:
            pass
    finally:
        await gestor.desconectar(id_vehiculo, ws)
