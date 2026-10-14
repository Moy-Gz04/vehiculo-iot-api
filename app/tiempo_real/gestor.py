"""Administración de clientes WebSocket agrupados por vehículo."""
import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import WebSocket

log = logging.getLogger("websocket")


class GestorWebSocket:
    """Cada vehículo tiene su propio grupo de clientes; un evento solo llega a los de su vehículo."""

    def __init__(self) -> None:
        self._clientes: dict[int, set[WebSocket]] = defaultdict(set)
        self._candado = asyncio.Lock()

    async def conectar(self, id_vehiculo: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._candado:
            self._clientes[id_vehiculo].add(ws)

    async def desconectar(self, id_vehiculo: int, ws: WebSocket) -> None:
        async with self._candado:
            self._clientes[id_vehiculo].discard(ws)

    def clientes(self, id_vehiculo: int) -> int:
        return len(self._clientes.get(id_vehiculo, ()))

    @staticmethod
    def evento(tipo: str, id_vehiculo: int, **datos) -> dict:
        """Formato común de todos los mensajes: tipo, vehículo, datos y marca temporal."""
        return {"evento": tipo, "id_vehiculo": id_vehiculo, **datos,
                "timestamp": datetime.now(timezone.utc).isoformat()}

    async def enviar(self, ws: WebSocket, mensaje: dict) -> None:
        await ws.send_json(mensaje, mode="text")

    async def publicar(self, id_vehiculo: int, mensaje: dict) -> int:
        """Envía a todos los clientes del vehículo; un cliente caído no afecta a los demás."""
        async with self._candado:
            destinos = list(self._clientes.get(id_vehiculo, ()))
        caidos = []
        for ws in destinos:
            try:
                await ws.send_json(mensaje)
            except Exception:  # cliente cerrado o red caída
                caidos.append(ws)
        for ws in caidos:
            await self.desconectar(id_vehiculo, ws)
            log.info("Cliente WebSocket del vehículo %s eliminado por desconexión", id_vehiculo)
        return len(destinos) - len(caidos)


gestor_ws = GestorWebSocket()
