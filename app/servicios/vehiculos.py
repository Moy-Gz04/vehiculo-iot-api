"""Reglas de negocio de vehículos y su catálogo de comandos."""
import threading
import time

from app.errores import NoEncontrado, SolicitudInvalida
from app.repositorios.procedimientos import RepositorioSP


class CatalogoEnMemoria:
    """Vehículo y comandos guardados en memoria para validar un movimiento sin esperar a RDS.

    Se leen con los mismos SP (sp_obtener_vehiculo, sp_obtener_comandos_vehiculo) y duran
    VIGENCIA_S segundos; cualquier alta, cambio o baja de vehículo o comando los descarta al
    momento, así que nunca se valida contra datos viejos de esta API.
    """

    VIGENCIA_S = 30

    def __init__(self, repo: RepositorioSP) -> None:
        self.repo = repo
        self._datos: dict[int, tuple[float, dict | None, dict[int, dict]]] = {}
        self._candado = threading.Lock()

    def obtener(self, id_vehiculo: int) -> tuple[dict | None, dict[int, dict]]:
        with self._candado:
            guardado = self._datos.get(id_vehiculo)
        if guardado and time.monotonic() - guardado[0] < self.VIGENCIA_S:
            return guardado[1], guardado[2]
        vehiculo = self.repo.obtener_vehiculo(id_vehiculo)
        comandos = {c["id_comando"]: c for c in self.repo.obtener_comandos_vehiculo(id_vehiculo)} if vehiculo else {}
        with self._candado:
            self._datos[id_vehiculo] = (time.monotonic(), vehiculo, comandos)
        return vehiculo, comandos

    def invalidar(self, id_vehiculo: int | None = None) -> None:
        with self._candado:
            if id_vehiculo is None:
                self._datos.clear()
            else:
                self._datos.pop(id_vehiculo, None)


class ServicioVehiculos:
    def __init__(self, repo: RepositorioSP) -> None:
        self.repo = repo
        self.catalogo = CatalogoEnMemoria(repo)

    def obtener_activo_rapido(self, id_vehiculo: int) -> dict:
        """Igual que obtener_activo, pero desde el catálogo en memoria (para los movimientos)."""
        v, _ = self.catalogo.obtener(id_vehiculo)
        if not v:
            raise NoEncontrado(f"El vehículo {id_vehiculo} no existe")
        if not v["activo"]:
            raise SolicitudInvalida(f"El vehículo {id_vehiculo} está inactivo")
        return v

    def listar(self) -> list[dict]:
        return self.repo.obtener_vehiculos()

    def obtener(self, id_vehiculo: int) -> dict:
        v = self.repo.obtener_vehiculo(id_vehiculo)
        if not v:
            raise NoEncontrado(f"El vehículo {id_vehiculo} no existe")
        return v

    def obtener_activo(self, id_vehiculo: int) -> dict:
        v = self.obtener(id_vehiculo)
        if not v["activo"]:
            raise SolicitudInvalida(f"El vehículo {id_vehiculo} está inactivo")
        return v

    def detalle(self, id_vehiculo: int) -> dict:
        """Vehículo con sus comandos, su último estado y sus DEMO (4 SP de consulta)."""
        return {
            "vehiculo": self.obtener(id_vehiculo),
            "comandos": self.repo.obtener_comandos_vehiculo(id_vehiculo),
            "estado": self.repo.obtener_estado(id_vehiculo),
            "demos": self.repo.obtener_demos(id_vehiculo),
        }

    def crear(self, d) -> int:
        nuevo = self.repo.crear_vehiculo(d.nombre, d.modelo, d.descripcion, d.microcontrolador)
        self.catalogo.invalidar(nuevo)
        return nuevo

    def actualizar(self, id_vehiculo: int, d) -> None:
        self.obtener(id_vehiculo)
        self.repo.actualizar_vehiculo(id_vehiculo, d.nombre, d.modelo, d.descripcion, d.microcontrolador, d.activo)
        self.catalogo.invalidar(id_vehiculo)

    def eliminar(self, id_vehiculo: int) -> None:
        self.obtener(id_vehiculo)
        self.repo.eliminar_vehiculo(id_vehiculo)
        self.catalogo.invalidar(id_vehiculo)


class ServicioComandos:
    def __init__(self, repo: RepositorioSP, vehiculos: ServicioVehiculos) -> None:
        self.repo = repo
        self.vehiculos = vehiculos

    def listar(self, id_vehiculo: int) -> list[dict]:
        self.vehiculos.obtener(id_vehiculo)
        return self.repo.obtener_comandos_vehiculo(id_vehiculo)

    def obtener(self, id_vehiculo: int, id_comando: int) -> dict:
        """El comando debe pertenecer al catálogo de ese vehículo; los de otro vehículo se rechazan."""
        for c in self.listar(id_vehiculo):
            if c["id_comando"] == id_comando:
                return c
        raise NoEncontrado(f"El comando {id_comando} no pertenece al vehículo {id_vehiculo}")

    def obtener_activo(self, id_vehiculo: int, id_comando: int) -> dict:
        c = self.obtener(id_vehiculo, id_comando)
        if not c["activo"]:
            raise SolicitudInvalida(f"El comando {c['nombre']} está inactivo")
        return c

    def obtener_activo_rapido(self, id_vehiculo: int, id_comando: int) -> dict:
        """Igual que obtener_activo, pero desde el catálogo en memoria (para los movimientos)."""
        _, comandos = self.vehiculos.catalogo.obtener(id_vehiculo)
        c = comandos.get(id_comando)
        if not c:
            raise NoEncontrado(f"El comando {id_comando} no pertenece al vehículo {id_vehiculo}")
        if not c["activo"]:
            raise SolicitudInvalida(f"El comando {c['nombre']} está inactivo")
        return c

    def crear(self, id_vehiculo: int, d) -> int:
        self.vehiculos.obtener(id_vehiculo)
        nuevo = self.repo.crear_comando(id_vehiculo, d.nombre, d.codigo, d.descripcion)
        self.vehiculos.catalogo.invalidar(id_vehiculo)
        return nuevo

    def actualizar(self, id_vehiculo: int, id_comando: int, d) -> None:
        self.obtener(id_vehiculo, id_comando)
        self.repo.actualizar_comando(id_comando, d.nombre, d.codigo, d.descripcion, d.activo)
        self.vehiculos.catalogo.invalidar(id_vehiculo)

    def eliminar(self, id_vehiculo: int, id_comando: int) -> None:
        self.obtener(id_vehiculo, id_comando)
        self.repo.eliminar_comando(id_comando)
        self.vehiculos.catalogo.invalidar(id_vehiculo)
