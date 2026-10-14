"""Endpoints de DEMO, sus movimientos y su ejecución."""
from fastapi import APIRouter, Depends, Path, Request

from app.dependencias import app_ctx, requiere_api_key
from app.modelos import esquemas as e
from app.rutas.vehiculos import AUT, ERR, IdV

demos = APIRouter(prefix="/vehiculos/{id_vehiculo}/demos", tags=["DEMO"])
IdD = Path(gt=0, description="Identificador de la DEMO")
IdM = Path(gt=0, description="Identificador del movimiento de DEMO")
CON_CLAVE = [Depends(requiere_api_key)]


@demos.get("", response_model=list[e.Demo], responses=ERR,
           summary="DEMO del vehículo", description="**SP:** `sp_obtener_demos`")
def listar_demos(id_vehiculo: int = IdV):
    return app_ctx.demos.listar(id_vehiculo)


@demos.post("", status_code=201, response_model=e.Creado, responses={**ERR, **AUT}, dependencies=CON_CLAVE,
            summary="Crear una DEMO", description="**SP:** `sp_crear_demo`")
def crear_demo(datos: e.DemoEntrada, id_vehiculo: int = IdV):
    return {"id": app_ctx.demos.crear(id_vehiculo, datos), "mensaje": "DEMO creada"}


@demos.post("/{id_demo}/actualizar", response_model=e.Mensaje, responses={**ERR, **AUT}, dependencies=CON_CLAVE,
            summary="Actualizar una DEMO", description="**SP:** `sp_obtener_demos`, `sp_actualizar_demo`")
def actualizar_demo(datos: e.DemoActualizar, id_vehiculo: int = IdV, id_demo: int = IdD):
    app_ctx.demos.actualizar(id_vehiculo, id_demo, datos)
    return {"mensaje": "DEMO actualizada"}


@demos.post("/{id_demo}/eliminar", response_model=e.Mensaje, responses={**ERR, **AUT}, dependencies=CON_CLAVE,
            summary="Eliminar una DEMO (y sus movimientos)", description="**SP:** `sp_obtener_demos`, `sp_eliminar_demo`")
def eliminar_demo(id_vehiculo: int = IdV, id_demo: int = IdD):
    app_ctx.demos.eliminar(id_vehiculo, id_demo)
    return {"mensaje": "DEMO eliminada"}


# ---------- Movimientos de la DEMO ----------
@demos.get("/{id_demo}/movimientos", response_model=list[e.MovimientoDemo], responses=ERR, tags=["Movimientos DEMO"],
           summary="Movimientos ordenados de la DEMO", description="**SP:** `sp_obtener_demos`, `sp_obtener_movimientos_demo`")
def listar_movimientos(id_vehiculo: int = IdV, id_demo: int = IdD):
    return app_ctx.demos.movimientos(id_vehiculo, id_demo)


@demos.post("/{id_demo}/movimientos", status_code=201, response_model=e.Mensaje, responses={**ERR, **AUT},
            dependencies=CON_CLAVE, tags=["Movimientos DEMO"],
            summary="Agregar un movimiento a la DEMO",
            description="El comando debe ser de este vehículo. Un orden repetido responde 409.\n\n**SP:** `sp_agregar_movimiento_demo`")
def agregar_movimiento(datos: e.MovimientoDemoEntrada, id_vehiculo: int = IdV, id_demo: int = IdD):
    app_ctx.demos.agregar_movimiento(id_vehiculo, id_demo, datos)
    return {"mensaje": "Movimiento agregado a la DEMO"}


@demos.post("/{id_demo}/movimientos/{id_mov}/actualizar", response_model=e.Mensaje, responses={**ERR, **AUT},
            dependencies=CON_CLAVE, tags=["Movimientos DEMO"],
            summary="Actualizar un movimiento de la DEMO",
            description="**SP:** `sp_obtener_movimientos_demo`, `sp_actualizar_movimiento_demo`")
def actualizar_movimiento(datos: e.MovimientoDemoEntrada, id_vehiculo: int = IdV, id_demo: int = IdD, id_mov: int = IdM):
    app_ctx.demos.actualizar_movimiento(id_vehiculo, id_demo, id_mov, datos)
    return {"mensaje": "Movimiento de la DEMO actualizado"}


@demos.post("/{id_demo}/movimientos/{id_mov}/eliminar", response_model=e.Mensaje, responses={**ERR, **AUT},
            dependencies=CON_CLAVE, tags=["Movimientos DEMO"],
            summary="Eliminar un movimiento de la DEMO",
            description="**SP:** `sp_obtener_movimientos_demo`, `sp_eliminar_movimiento_demo`")
def eliminar_movimiento(id_vehiculo: int = IdV, id_demo: int = IdD, id_mov: int = IdM):
    app_ctx.demos.eliminar_movimiento(id_vehiculo, id_demo, id_mov)
    return {"mensaje": "Movimiento de la DEMO eliminado"}


# ---------- Ejecución ----------
@demos.post("/{id_demo}/iniciar", status_code=202, response_model=e.DemoIniciada, responses={**ERR, **AUT},
            dependencies=CON_CLAVE, tags=["Ejecución DEMO"],
            summary="Iniciar una DEMO (se transmite por WebSocket)",
            description=("Responde 202 de inmediato y transmite por `ws://<servidor>:8000/ws/vehiculos/{id}` los eventos "
                         "`demo_inicio`, un `demo_movimiento` por cada uno de los N movimientos (respetando `duracion_ms` y "
                         "`pausa_ms`) y `demo_fin`. Actualiza el estado con `sp_actualizar_estado` pero **NO** llama a "
                         "`sp_registrar_historial`. 409 si el vehículo ya ejecuta otra DEMO.\n\n"
                         "**SP:** `sp_obtener_vehiculo`, `sp_obtener_demos`, `sp_obtener_movimientos_demo`, "
                         "`sp_obtener_estado`, `sp_actualizar_estado`"))
async def iniciar_demo(request: Request, id_vehiculo: int = IdV, id_demo: int = IdD):
    r = await app_ctx.ejecutor.iniciar(id_vehiculo, id_demo)
    return {"mensaje": "DEMO iniciada", "id_vehiculo": id_vehiculo, "id_demo": id_demo,
            "movimientos": r["movimientos"], "websocket": str(request.base_url).replace("http", "ws", 1) + f"ws/vehiculos/{id_vehiculo}"}


@demos.post("/cancelar", response_model=e.Mensaje, responses={**ERR, **AUT}, dependencies=CON_CLAVE,
            tags=["Ejecución DEMO"], summary="Cancelar la DEMO en curso",
            description="Detiene de inmediato la emisión de movimientos y publica `demo_cancelada` por WebSocket.")
async def cancelar_demo(id_vehiculo: int = IdV):
    await app_ctx.ejecutor.cancelar(id_vehiculo)
    return {"mensaje": "DEMO cancelada"}
