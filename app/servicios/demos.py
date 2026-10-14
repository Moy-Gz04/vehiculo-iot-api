"""DEMO: catálogo de secuencias y su ejecución en tiempo real por WebSocket."""
import asyncio
import logging

from app.errores import Conflicto, NoEncontrado, SolicitudInvalida
from app.repositorios.procedimientos import RepositorioSP
from app.servicios.vehiculos import ServicioComandos, ServicioVehiculos
from app.tiempo_real.gestor import GestorWebSocket

log = logging.getLogger("demo")


class ServicioDemos:
    def __init__(self, repo: RepositorioSP, vehiculos: ServicioVehiculos, comandos: ServicioComandos) -> None:
        self.repo = repo
        self.vehiculos = vehiculos
        self.comandos = comandos

    def listar(self, id_vehiculo: int) -> list[dict]:
        self.vehiculos.obtener(id_vehiculo)
        return self.repo.obtener_demos(id_vehiculo)

    def obtener(self, id_vehiculo: int, id_demo: int) -> dict:
        for d in self.listar(id_vehiculo):
            if d["id_demo"] == id_demo:
                return d
        raise NoEncontrado(f"La DEMO {id_demo} no pertenece al vehículo {id_vehiculo}")

    def crear(self, id_vehiculo: int, d) -> int:
        self.vehiculos.obtener(id_vehiculo)
        return self.repo.crear_demo(id_vehiculo, d.nombre, d.descripcion)

    def actualizar(self, id_vehiculo: int, id_demo: int, d) -> None:
        self.obtener(id_vehiculo, id_demo)
        self.repo.actualizar_demo(id_demo, d.nombre, d.descripcion, d.activo)

    def eliminar(self, id_vehiculo: int, id_demo: int) -> None:
        self.obtener(id_vehiculo, id_demo)
        self.repo.eliminar_demo(id_demo)

    # ---------- Movimientos de la DEMO ----------
    def movimientos(self, id_vehiculo: int, id_demo: int) -> list[dict]:
        self.obtener(id_vehiculo, id_demo)
        return self.repo.obtener_movimientos_demo(id_demo)

    def _movimiento(self, id_vehiculo: int, id_demo: int, id_mov: int) -> dict:
        for m in self.movimientos(id_vehiculo, id_demo):
            if m["id_demo_movimiento"] == id_mov:
                return m
        raise NoEncontrado(f"El movimiento {id_mov} no pertenece a la DEMO {id_demo}")

    def agregar_movimiento(self, id_vehiculo: int, id_demo: int, d) -> None:
        self.obtener(id_vehiculo, id_demo)
        self.comandos.obtener(id_vehiculo, d.id_comando)
        self.repo.agregar_movimiento_demo(id_demo, d.id_comando, d.orden, d.duracion_ms, d.pausa_ms)

    def actualizar_movimiento(self, id_vehiculo: int, id_demo: int, id_mov: int, d) -> None:
        self._movimiento(id_vehiculo, id_demo, id_mov)
        self.comandos.obtener(id_vehiculo, d.id_comando)
        self.repo.actualizar_movimiento_demo(id_mov, d.id_comando, d.orden, d.duracion_ms, d.pausa_ms)

    def eliminar_movimiento(self, id_vehiculo: int, id_demo: int, id_mov: int) -> None:
        self._movimiento(id_vehiculo, id_demo, id_mov)
        self.repo.eliminar_movimiento_demo(id_mov)


class EjecutorDemos:
    """Corre una DEMO como tarea asíncrona: no bloquea otras solicitudes ni WebSockets.
    Solo una DEMO a la vez por vehículo; se puede cancelar en cualquier momento.
    Actualiza el estado con sp_actualizar_estado y NUNCA llama a sp_registrar_historial."""

    def __init__(self, repo: RepositorioSP, demos: ServicioDemos, ws: GestorWebSocket) -> None:
        self.repo = repo
        self.demos = demos
        self.ws = ws
        self._tareas: dict[int, asyncio.Task] = {}

    def en_curso(self, id_vehiculo: int) -> bool:
        t = self._tareas.get(id_vehiculo)
        return bool(t and not t.done())

    async def iniciar(self, id_vehiculo: int, id_demo: int) -> dict:
        await asyncio.to_thread(self.demos.vehiculos.obtener_activo, id_vehiculo)
        demo = await asyncio.to_thread(self.demos.obtener, id_vehiculo, id_demo)
        if not demo["activo"]:
            raise SolicitudInvalida(f"La DEMO {id_demo} está inactiva")
        if self.en_curso(id_vehiculo):
            raise Conflicto(f"El vehículo {id_vehiculo} ya está ejecutando una DEMO")
        movimientos = await asyncio.to_thread(self.repo.obtener_movimientos_demo, id_demo)
        if not movimientos:
            raise SolicitudInvalida(f"La DEMO {id_demo} no tiene movimientos")
        self._tareas[id_vehiculo] = asyncio.create_task(self._correr(id_vehiculo, demo, movimientos))
        return {"demo": demo, "movimientos": len(movimientos)}

    async def cancelar(self, id_vehiculo: int) -> None:
        t = self._tareas.get(id_vehiculo)
        if not t or t.done():
            raise NoEncontrado(f"El vehículo {id_vehiculo} no tiene una DEMO en ejecución")
        t.cancel()

    async def _correr(self, id_vehiculo: int, demo: dict, movimientos: list[dict]) -> None:
        ev, n = self.ws.evento, len(movimientos)
        base = {"id_demo": demo["id_demo"], "demo": demo["nombre"]}
        await self.ws.publicar(id_vehiculo, ev("demo_inicio", id_vehiculo, **base, total_movimientos=n))
        hecho = 0
        try:
            actual = await asyncio.to_thread(self.repo.obtener_estado, id_vehiculo)
            conectado = bool(actual["conectado"]) if actual else False
            for m in movimientos:
                await asyncio.to_thread(self.repo.actualizar_estado, id_vehiculo, m["id_comando"], conectado)
                await self.ws.publicar(id_vehiculo, ev(
                    "demo_movimiento", id_vehiculo, **base, numero=hecho + 1, total_movimientos=n,
                    orden=m["orden"], id_comando=m["id_comando"], comando=m["comando"], codigo=m["codigo"],
                    duracion_ms=m["duracion_ms"], pausa_ms=m["pausa_ms"]))
                await asyncio.sleep((m["duracion_ms"] + m["pausa_ms"]) / 1000)
                hecho += 1
            await self.ws.publicar(id_vehiculo, ev("demo_fin", id_vehiculo, **base, movimientos_enviados=hecho,
                                                   historial="sin cambios (los movimientos de DEMO no se registran)"))
        except asyncio.CancelledError:
            await self.ws.publicar(id_vehiculo, ev("demo_cancelada", id_vehiculo, **base, movimientos_enviados=hecho))
        except Exception:
            log.exception("Error durante la DEMO %s", demo["id_demo"])
            await self.ws.publicar(id_vehiculo, ev("demo_error", id_vehiculo, **base, movimientos_enviados=hecho,
                                                   detalle="La DEMO se detuvo por un error de datos o de conexión con RDS"))
        finally:
            self._tareas.pop(id_vehiculo, None)
