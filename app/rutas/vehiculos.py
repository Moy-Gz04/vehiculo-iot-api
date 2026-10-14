"""Endpoints de vehículos y de su catálogo de comandos."""
from fastapi import APIRouter, Depends, Path

from app.dependencias import app_ctx, requiere_api_key
from app.modelos import esquemas as e

ERR = {400: {"description": "Datos inválidos"}, 404: {"description": "No existe"},
       409: {"description": "Duplicado o en conflicto"}, 503: {"description": "Amazon RDS no disponible"}}
AUT = {401: {"description": "Falta X-API-Key"}, 403: {"description": "X-API-Key incorrecta"}}
IdV = Path(gt=0, description="Identificador del vehículo")
IdC = Path(gt=0, description="Identificador del comando")

vehiculos = APIRouter(prefix="/vehiculos", tags=["Vehículos"])
comandos = APIRouter(prefix="/vehiculos/{id_vehiculo}/comandos", tags=["Comandos"])


@vehiculos.get("", response_model=list[e.Vehiculo], responses=ERR,
               summary="Listar vehículos", description="**SP:** `sp_obtener_vehiculos`")
def listar_vehiculos():
    return app_ctx.vehiculos.listar()


@vehiculos.get("/{id_vehiculo}", response_model=e.Vehiculo, responses=ERR,
               summary="Consultar un vehículo", description="**SP:** `sp_obtener_vehiculo`")
def obtener_vehiculo(id_vehiculo: int = IdV):
    return app_ctx.vehiculos.obtener(id_vehiculo)


@vehiculos.get("/{id_vehiculo}/detalle", response_model=e.VehiculoDetalle, responses=ERR,
               summary="Vehículo con comandos, último estado y DEMO",
               description="**SP:** `sp_obtener_vehiculo`, `sp_obtener_comandos_vehiculo`, `sp_obtener_estado`, `sp_obtener_demos`")
def detalle_vehiculo(id_vehiculo: int = IdV):
    return app_ctx.vehiculos.detalle(id_vehiculo)


@vehiculos.post("", status_code=201, response_model=e.Creado, responses={**ERR, **AUT},
                dependencies=[Depends(requiere_api_key)],
                summary="Registrar un vehículo", description="**SP:** `sp_crear_vehiculo`")
def crear_vehiculo(datos: e.VehiculoEntrada):
    return {"id": app_ctx.vehiculos.crear(datos), "mensaje": "Vehículo registrado"}


@vehiculos.post("/{id_vehiculo}/actualizar", response_model=e.Mensaje, responses={**ERR, **AUT},
                dependencies=[Depends(requiere_api_key)],
                summary="Actualizar un vehículo", description="**SP:** `sp_obtener_vehiculo`, `sp_actualizar_vehiculo`")
def actualizar_vehiculo(datos: e.VehiculoActualizar, id_vehiculo: int = IdV):
    app_ctx.vehiculos.actualizar(id_vehiculo, datos)
    return {"mensaje": "Vehículo actualizado"}


@vehiculos.post("/{id_vehiculo}/eliminar", response_model=e.Mensaje, responses={**ERR, **AUT},
                dependencies=[Depends(requiere_api_key)],
                summary="Eliminar un vehículo (con sus comandos, estado, historial y DEMO)",
                description="**SP:** `sp_obtener_vehiculo`, `sp_eliminar_vehiculo`. Operación destructiva: requiere X-API-Key.")
def eliminar_vehiculo(id_vehiculo: int = IdV):
    app_ctx.vehiculos.eliminar(id_vehiculo)
    return {"mensaje": "Vehículo eliminado"}


@comandos.get("", response_model=list[e.Comando], responses=ERR,
              summary="Catálogo de comandos del vehículo", description="**SP:** `sp_obtener_comandos_vehiculo`")
def listar_comandos(id_vehiculo: int = IdV):
    return app_ctx.comandos.listar(id_vehiculo)


@comandos.post("", status_code=201, response_model=e.Creado, responses={**ERR, **AUT},
               dependencies=[Depends(requiere_api_key)],
               summary="Agregar un comando al catálogo",
               description="**SP:** `sp_crear_comando`. Crea un comando nuevo; NO ejecuta un movimiento.")
def crear_comando(datos: e.ComandoEntrada, id_vehiculo: int = IdV):
    return {"id": app_ctx.comandos.crear(id_vehiculo, datos), "mensaje": "Comando agregado al catálogo"}


@comandos.post("/{id_comando}/actualizar", response_model=e.Mensaje, responses={**ERR, **AUT},
               dependencies=[Depends(requiere_api_key)],
               summary="Actualizar un comando", description="**SP:** `sp_obtener_comandos_vehiculo`, `sp_actualizar_comando`")
def actualizar_comando(datos: e.ComandoActualizar, id_vehiculo: int = IdV, id_comando: int = IdC):
    app_ctx.comandos.actualizar(id_vehiculo, id_comando, datos)
    return {"mensaje": "Comando actualizado"}


@comandos.post("/{id_comando}/eliminar", response_model=e.Mensaje, responses={**ERR, **AUT},
               dependencies=[Depends(requiere_api_key)],
               summary="Eliminar un comando",
               description="**SP:** `sp_obtener_comandos_vehiculo`, `sp_eliminar_comando`. Si una DEMO lo usa, responde 409.")
def eliminar_comando(id_vehiculo: int = IdV, id_comando: int = IdC):
    app_ctx.comandos.eliminar(id_vehiculo, id_comando)
    return {"mensaje": "Comando eliminado"}
