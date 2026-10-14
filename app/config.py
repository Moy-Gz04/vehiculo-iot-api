"""Configuración de la API leída desde variables de entorno (.env)."""
import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Configuracion:
    """Agrupa los parámetros de conexión a Amazon RDS y de seguridad."""

    db_host: str
    db_puerto: int
    db_usuario: str
    db_password: str
    db_nombre: str
    api_key: str

    @classmethod
    def desde_entorno(cls) -> "Configuracion":
        faltan = [v for v in ("DB_HOST", "DB_USER", "DB_PASSWORD", "API_KEY") if not os.getenv(v)]
        if faltan:
            raise RuntimeError(f"Faltan variables de entorno: {', '.join(faltan)} (revisa tu archivo .env)")
        return cls(
            db_host=os.environ["DB_HOST"],
            db_puerto=int(os.getenv("DB_PORT", "3306")),
            db_usuario=os.environ["DB_USER"],
            db_password=os.environ["DB_PASSWORD"],
            db_nombre=os.getenv("DB_NAME", "vehiculo_iot"),
            api_key=os.environ["API_KEY"],
        )


configuracion = Configuracion.desde_entorno()
