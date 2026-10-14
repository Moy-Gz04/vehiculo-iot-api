"""Construye una sola vez los objetos de la API y la autenticación por API key."""
from typing import Optional

from fastapi import Security
from fastapi.security import APIKeyHeader

from app.config import configuracion
from app.db.conexion import BaseDatos
from app.errores import ErrorNegocio, Prohibido
from app.repositorios.procedimientos import RepositorioSP
from app.servicios.demos import EjecutorDemos, ServicioDemos
from app.servicios.movimientos import ServicioEstado, ServicioHistorial, ServicioMovimientos
from app.servicios.vehiculos import ServicioComandos, ServicioVehiculos
from app.tiempo_real.gestor import gestor_ws


class Contenedor:
    def __init__(self) -> None:
        self.repo = RepositorioSP(BaseDatos(configuracion))
        self.vehiculos = ServicioVehiculos(self.repo)
        self.comandos = ServicioComandos(self.repo, self.vehiculos)
        self.estado = ServicioEstado(self.repo, self.vehiculos)
        self.historial = ServicioHistorial(self.repo, self.vehiculos)
        self.movimientos = ServicioMovimientos(self.repo, self.vehiculos, self.comandos)
        self.demos = ServicioDemos(self.repo, self.vehiculos, self.comandos)
        self.ejecutor = EjecutorDemos(self.repo, self.demos, gestor_ws)
        self.ws = gestor_ws


app_ctx = Contenedor()


class NoAutenticado(ErrorNegocio):
    codigo_http = 401


esquema_clave = APIKeyHeader(name="X-API-Key", auto_error=False,
                             description="Clave de la API (variable API_KEY del archivo .env)")


def requiere_api_key(x_api_key: Optional[str] = Security(esquema_clave)) -> None:
    """Protege las operaciones de control, modificación y eliminación."""
    if not x_api_key:
        raise NoAutenticado("Falta el encabezado X-API-Key")
    if x_api_key != configuracion.api_key:
        raise Prohibido("La X-API-Key no es válida")
