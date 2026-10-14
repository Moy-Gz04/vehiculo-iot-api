"""Reglas de negocio de vehículos y su catálogo de comandos."""
from app.errores import NoEncontrado, SolicitudInvalida
from app.repositorios.procedimientos import RepositorioSP


class ServicioVehiculos:
    def __init__(self, repo: RepositorioSP) -> None:
        self.repo = repo

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
        return self.repo.crear_vehiculo(d.nombre, d.modelo, d.descripcion, d.microcontrolador)

    def actualizar(self, id_vehiculo: int, d) -> None:
        self.obtener(id_vehiculo)
        self.repo.actualizar_vehiculo(id_vehiculo, d.nombre, d.modelo, d.descripcion, d.microcontrolador, d.activo)

    def eliminar(self, id_vehiculo: int) -> None:
        self.obtener(id_vehiculo)
        self.repo.eliminar_vehiculo(id_vehiculo)


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

    def crear(self, id_vehiculo: int, d) -> int:
        self.vehiculos.obtener(id_vehiculo)
        return self.repo.crear_comando(id_vehiculo, d.nombre, d.codigo, d.descripcion)

    def actualizar(self, id_vehiculo: int, id_comando: int, d) -> None:
        self.obtener(id_vehiculo, id_comando)
        self.repo.actualizar_comando(id_comando, d.nombre, d.codigo, d.descripcion, d.activo)

    def eliminar(self, id_vehiculo: int, id_comando: int) -> None:
        self.obtener(id_vehiculo, id_comando)
        self.repo.eliminar_comando(id_comando)
