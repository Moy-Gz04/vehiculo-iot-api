"""Modelos JSON de entrada y salida (validación con Pydantic)."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------- Entradas ----------
class VehiculoEntrada(BaseModel):
    nombre: str = Field(min_length=1, max_length=80, examples=["Excavadora IoT"])
    modelo: Optional[str] = Field(None, max_length=80, examples=["Modelo X"])
    descripcion: Optional[str] = Field(None, max_length=255)
    microcontrolador: Optional[str] = Field(None, max_length=50, examples=["ESP8266"])


class VehiculoActualizar(VehiculoEntrada):
    activo: bool = True


class ComandoEntrada(BaseModel):
    nombre: str = Field(min_length=1, max_length=60, pattern=r"^[A-Z0-9_]+$", examples=["AVANZAR"])
    codigo: int = Field(ge=0, le=9999, examples=[1])
    descripcion: Optional[str] = Field(None, max_length=255)


class ComandoActualizar(ComandoEntrada):
    activo: bool = True


class MovimientoIndividual(BaseModel):
    id_comando: int = Field(gt=0, description="Comando del catálogo de ESTE vehículo", examples=[1])
    origen: str = Field("API", min_length=1, max_length=30, examples=["THUNDER-CLIENT"])


class DemoEntrada(BaseModel):
    nombre: str = Field(min_length=1, max_length=80, examples=["Demo principal"])
    descripcion: Optional[str] = Field(None, max_length=255)


class DemoActualizar(DemoEntrada):
    activo: bool = True


class MovimientoDemoEntrada(BaseModel):
    id_comando: int = Field(gt=0)
    orden: int = Field(gt=0, le=1000)
    duracion_ms: int = Field(gt=0, le=60000, description="Duración del movimiento en milisegundos")
    pausa_ms: int = Field(0, ge=0, le=60000, description="Pausa posterior en milisegundos")


# ---------- Salidas ----------
class Vehiculo(BaseModel):
    id_vehiculo: int
    nombre: str
    modelo: Optional[str] = None
    descripcion: Optional[str] = None
    microcontrolador: Optional[str] = None
    fecha_registro: Optional[datetime] = None
    activo: bool


class Comando(BaseModel):
    id_comando: int
    id_vehiculo: int
    nombre: str
    codigo: int
    descripcion: Optional[str] = None
    activo: bool


class Estado(BaseModel):
    id_vehiculo: int
    vehiculo: str
    id_comando: Optional[int] = None
    comando: Optional[str] = None
    codigo: Optional[int] = None
    conectado: bool
    fecha_actualizacion: Optional[datetime] = None


class RegistroHistorial(BaseModel):
    id_historial: int
    id_vehiculo: int
    comando: Optional[str] = None
    codigo: Optional[int] = None
    fecha_hora: datetime
    origen: str


class Historial(BaseModel):
    id_vehiculo: int
    limite: int = Field(description="Máximo de movimientos devueltos (10)")
    total_devueltos: int
    movimientos: list[RegistroHistorial]


class Demo(BaseModel):
    id_demo: int
    id_vehiculo: int
    nombre: str
    descripcion: Optional[str] = None
    activo: bool


class MovimientoDemo(BaseModel):
    id_demo_movimiento: int
    orden: int
    id_comando: int
    comando: str
    codigo: int
    duracion_ms: int
    pausa_ms: int


class VehiculoDetalle(BaseModel):
    vehiculo: Vehiculo
    comandos: list[Comando]
    estado: Optional[Estado]
    demos: list[Demo]


class Creado(BaseModel):
    id: int
    mensaje: str


class Mensaje(BaseModel):
    mensaje: str


class ResultadoMovimiento(BaseModel):
    mensaje: str
    id_vehiculo: int
    id_comando: int
    comando: str
    codigo: int
    origen: str
    estado: Estado
    clientes_notificados: int


class DemoIniciada(BaseModel):
    mensaje: str
    id_vehiculo: int
    id_demo: int
    movimientos: int
    websocket: str
