"""Estado, historial y ejecución de movimientos individuales."""
from app.repositorios.procedimientos import RepositorioSP
from app.servicios.vehiculos import ServicioComandos, ServicioVehiculos

LIMITE_HISTORIAL = 10


class ServicioEstado:
    def __init__(self, repo: RepositorioSP, vehiculos: ServicioVehiculos) -> None:
        self.repo = repo
        self.vehiculos = vehiculos

    def obtener(self, id_vehiculo: int) -> dict | None:
        """None = el vehículo existe pero todavía no tiene estado registrado."""
        self.vehiculos.obtener(id_vehiculo)
        return self.repo.obtener_estado(id_vehiculo)


class ServicioHistorial:
    def __init__(self, repo: RepositorioSP, vehiculos: ServicioVehiculos) -> None:
        self.repo = repo
        self.vehiculos = vehiculos

    def ultimos(self, id_vehiculo: int) -> dict:
        """Los 10 movimientos individuales más recientes (el SP ya los ordena del más nuevo al más viejo).
        El historial completo se conserva en RDS; aquí solo se recorta lo que se devuelve."""
        self.vehiculos.obtener(id_vehiculo)
        movimientos = self.repo.obtener_historial(id_vehiculo)[:LIMITE_HISTORIAL]
        return {"id_vehiculo": id_vehiculo, "limite": LIMITE_HISTORIAL,
                "total_devueltos": len(movimientos), "movimientos": movimientos}


class ServicioMovimientos:
    def __init__(self, repo: RepositorioSP, vehiculos: ServicioVehiculos, comandos: ServicioComandos) -> None:
        self.repo = repo
        self.vehiculos = vehiculos
        self.comandos = comandos

    def validar(self, id_vehiculo: int, id_comando: int) -> dict:
        """Vehículo activo y comando activo de ese vehículo (desde el catálogo en memoria)."""
        self.vehiculos.obtener_activo_rapido(id_vehiculo)
        return self.comandos.obtener_activo_rapido(id_vehiculo, id_comando)

    def registrar(self, id_vehiculo: int, id_comando: int, origen: str) -> None:
        """Estado + historial en UNA transacción y una sola conexión. Si algo falla, rollback."""
        with self.repo.db.transaccion() as s:
            # Recibir un HTTP no prueba que el vehículo esté conectado: se conserva el valor actual
            actual = self.repo.obtener_estado(id_vehiculo, s=s)
            conectado = bool(actual["conectado"]) if actual else False
            self.repo.actualizar_estado(id_vehiculo, id_comando, conectado, s=s)
            self.repo.registrar_historial(id_vehiculo, id_comando, origen, s=s)

    def ejecutar(self, id_vehiculo: int, id_comando: int, origen: str) -> dict:
        """Valida y guarda un movimiento individual y devuelve el estado resultante."""
        comando = self.validar(id_vehiculo, id_comando)
        self.registrar(id_vehiculo, id_comando, origen)
        return {"comando": comando, "estado": self.repo.obtener_estado(id_vehiculo)}
