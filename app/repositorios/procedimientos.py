"""Acceso a los 21 Stored Procedures de vehiculo_iot (sin reglas de negocio).

Cada método corresponde exactamente a un SP y conserva su nombre y parámetros.
Los métodos que reciben `s` se ejecutan dentro de una transacción abierta.
"""
from typing import Optional

from app.db.conexion import BaseDatos, Sesion


class RepositorioSP:
    def __init__(self, db: BaseDatos) -> None:
        self.db = db

    # ---------- Vehículos ----------
    def crear_vehiculo(self, nombre, modelo, descripcion, micro) -> int:
        return self.db.llamar("sp_crear_vehiculo", nombre, modelo, descripcion, micro)[0]["id_vehiculo"]

    def obtener_vehiculos(self) -> list[dict]:
        return self.db.llamar("sp_obtener_vehiculos")

    def obtener_vehiculo(self, id_vehiculo: int) -> Optional[dict]:
        filas = self.db.llamar("sp_obtener_vehiculo", id_vehiculo)
        return filas[0] if filas else None

    def actualizar_vehiculo(self, id_vehiculo, nombre, modelo, descripcion, micro, activo) -> None:
        self.db.llamar("sp_actualizar_vehiculo", id_vehiculo, nombre, modelo, descripcion, micro, activo)

    def eliminar_vehiculo(self, id_vehiculo: int) -> None:
        self.db.llamar("sp_eliminar_vehiculo", id_vehiculo)

    # ---------- Comandos ----------
    def crear_comando(self, id_vehiculo, nombre, codigo, descripcion) -> int:
        return self.db.llamar("sp_crear_comando", id_vehiculo, nombre, codigo, descripcion)[0]["id_comando"]

    def obtener_comandos_vehiculo(self, id_vehiculo: int) -> list[dict]:
        return self.db.llamar("sp_obtener_comandos_vehiculo", id_vehiculo)

    def actualizar_comando(self, id_comando, nombre, codigo, descripcion, activo) -> None:
        self.db.llamar("sp_actualizar_comando", id_comando, nombre, codigo, descripcion, activo)

    def eliminar_comando(self, id_comando: int) -> None:
        self.db.llamar("sp_eliminar_comando", id_comando)

    # ---------- Estado ----------
    def actualizar_estado(self, id_vehiculo, id_comando, conectado, s: Optional[Sesion] = None) -> None:
        args = ("sp_actualizar_estado", id_vehiculo, id_comando, conectado)
        s.llamar(*args) if s else self.db.llamar(*args)

    def obtener_estado(self, id_vehiculo: int, s: Optional[Sesion] = None) -> Optional[dict]:
        filas = s.llamar("sp_obtener_estado", id_vehiculo) if s else self.db.llamar("sp_obtener_estado", id_vehiculo)
        return filas[0] if filas else None

    # ---------- Historial ----------
    def registrar_historial(self, id_vehiculo, id_comando, origen, s: Optional[Sesion] = None) -> None:
        args = ("sp_registrar_historial", id_vehiculo, id_comando, origen)
        s.llamar(*args) if s else self.db.llamar(*args)

    def obtener_historial(self, id_vehiculo: int) -> list[dict]:
        return self.db.llamar("sp_obtener_historial", id_vehiculo)

    # ---------- DEMO ----------
    def crear_demo(self, id_vehiculo, nombre, descripcion) -> int:
        return self.db.llamar("sp_crear_demo", id_vehiculo, nombre, descripcion)[0]["id_demo"]

    def obtener_demos(self, id_vehiculo: int) -> list[dict]:
        return self.db.llamar("sp_obtener_demos", id_vehiculo)

    def actualizar_demo(self, id_demo, nombre, descripcion, activo) -> None:
        self.db.llamar("sp_actualizar_demo", id_demo, nombre, descripcion, activo)

    def eliminar_demo(self, id_demo: int) -> None:
        self.db.llamar("sp_eliminar_demo", id_demo)

    # ---------- Movimientos de DEMO ----------
    def agregar_movimiento_demo(self, id_demo, id_comando, orden, duracion_ms, pausa_ms) -> None:
        self.db.llamar("sp_agregar_movimiento_demo", id_demo, id_comando, orden, duracion_ms, pausa_ms)

    def obtener_movimientos_demo(self, id_demo: int) -> list[dict]:
        return self.db.llamar("sp_obtener_movimientos_demo", id_demo)

    def actualizar_movimiento_demo(self, id_mov, id_comando, orden, duracion_ms, pausa_ms) -> None:
        self.db.llamar("sp_actualizar_movimiento_demo", id_mov, id_comando, orden, duracion_ms, pausa_ms)

    def eliminar_movimiento_demo(self, id_mov: int) -> None:
        self.db.llamar("sp_eliminar_movimiento_demo", id_mov)
