"""Conexión a MySQL (Amazon RDS) y ejecución segura de Stored Procedures."""
import queue
import time
from collections import Counter
from contextlib import contextmanager
from typing import Any, Iterator

import pymysql
from pymysql.cursors import DictCursor

from app.config import Configuracion


class ErrorBaseDatos(Exception):
    """La base de datos no respondió o rechazó la operación."""


class UsoProcedimientos:
    """Lleva la cuenta de cuántas veces se ejecutó cada SP desde que arrancó la API (evidencia de uso)."""

    def __init__(self) -> None:
        self.llamadas: Counter = Counter()
        self.ultima: dict[str, float] = {}

    def registrar(self, sp: str) -> None:
        self.llamadas[sp] += 1
        self.ultima[sp] = time.time()


uso_sp = UsoProcedimientos()


class BaseDatos:
    """Abre conexiones a RDS y ejecuta procedimientos con parámetros enlazados.

    Mantiene un pequeño pool de conexiones abiertas: abrir una conexión nueva a RDS
    (TCP + autenticación) cuesta mucho más que la consulta, y un movimiento hace
    varias consultas seguidas. Reutilizarlas baja la latencia de cada orden.
    """

    MAX_LIBRES = 6

    def __init__(self, cfg: Configuracion) -> None:
        self._cfg = cfg
        self._libres: queue.LifoQueue = queue.LifoQueue()

    def _tomar(self) -> pymysql.connections.Connection:
        """Una conexión del pool si hay una sana; si no, una nueva."""
        while True:
            try:
                con = self._libres.get_nowait()
            except queue.Empty:
                return self._conectar()
            try:
                con.ping(reconnect=False)  # descarta las que RDS ya cerró por inactividad
                return con
            except Exception:
                try:
                    con.close()
                except Exception:
                    pass

    def _devolver(self, con: pymysql.connections.Connection, sana: bool = True) -> None:
        if sana and con.open and self._libres.qsize() < self.MAX_LIBRES:
            self._libres.put(con)
            return
        try:
            con.close()
        except Exception:
            pass

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
        con = self._tomar()
        sana = True
        try:
            yield Sesion(con)
            con.commit()
        except Exception:
            try:
                con.rollback()
            except Exception:
                sana = False
            raise
        finally:
            self._devolver(con, sana)

    def llamar(self, sp: str, *args: Any) -> list[dict]:
        """Ejecuta un único SP en su propia transacción."""
        with self.transaccion() as s:
            return s.llamar(sp, *args)

    def consulta(self, sql: str, *args: Any) -> list[dict]:
        """Consulta de solo lectura para el diagnóstico del portal (metadatos, nunca datos de negocio)."""
        con = self._tomar()
        sana = True
        try:
            with con.cursor() as cur:
                cur.execute(sql, args)
                filas = list(cur.fetchall())
            con.commit()  # cierra la lectura para que la conexión vuelva limpia al pool
            return filas
        except Exception:
            sana = False
            raise
        finally:
            self._devolver(con, sana)


class Sesion:
    """Una conexión abierta dentro de una transacción."""

    def __init__(self, con: pymysql.connections.Connection) -> None:
        self._con = con

    def llamar(self, sp: str, *args: Any) -> list[dict]:
        # callproc envía los valores como parámetros enlazados: nunca se concatenan en el SQL
        uso_sp.registrar(sp)
        with self._con.cursor() as cur:
            cur.callproc(sp, args)
            filas = list(cur.fetchall())
            while cur.nextset():
                pass
            return filas
