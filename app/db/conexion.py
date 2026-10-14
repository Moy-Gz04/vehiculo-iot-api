"""Conexión a MySQL (Amazon RDS) y ejecución segura de Stored Procedures."""
from contextlib import contextmanager
from typing import Any, Iterator

import pymysql
from pymysql.cursors import DictCursor

from app.config import Configuracion


class ErrorBaseDatos(Exception):
    """La base de datos no respondió o rechazó la operación."""


class BaseDatos:
    """Abre conexiones a RDS y ejecuta procedimientos con parámetros enlazados."""

    def __init__(self, cfg: Configuracion) -> None:
        self._cfg = cfg

    def _conectar(self) -> pymysql.connections.Connection:
        try:
            return pymysql.connect(
                host=self._cfg.db_host, port=self._cfg.db_puerto,
                user=self._cfg.db_usuario, password=self._cfg.db_password,
                database=self._cfg.db_nombre, cursorclass=DictCursor,
                autocommit=False, connect_timeout=8, charset="utf8mb4",
            )
        except pymysql.MySQLError as e:
            raise ErrorBaseDatos("No se pudo conectar con Amazon RDS") from e

    @contextmanager
    def transaccion(self) -> Iterator["Sesion"]:
        """Varias llamadas a SP en una sola transacción: commit al final o rollback si algo falla."""
        con = self._conectar()
        try:
            yield Sesion(con)
            con.commit()
        except Exception:
            con.rollback()
            raise
        finally:
            con.close()

    def llamar(self, sp: str, *args: Any) -> list[dict]:
        """Ejecuta un único SP en su propia transacción."""
        with self.transaccion() as s:
            return s.llamar(sp, *args)


class Sesion:
    """Una conexión abierta dentro de una transacción."""

    def __init__(self, con: pymysql.connections.Connection) -> None:
        self._con = con

    def llamar(self, sp: str, *args: Any) -> list[dict]:
        # callproc envía los valores como parámetros enlazados: nunca se concatenan en el SQL
        with self._con.cursor() as cur:
            cur.callproc(sp, args)
            filas = list(cur.fetchall())
            while cur.nextset():
                pass
            return filas
