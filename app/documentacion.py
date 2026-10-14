"""Textos de la documentación (Swagger UI en /docs) y página personalizada."""
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse

DESCRIPCION = """
API que funciona como **cerebro del vehículo IoT**: recibe órdenes, valida que sean correctas, las guarda en la base
de datos `vehiculo_iot` (21 Stored Procedures) y las avisa en tiempo real por **WebSocket** al vehículo y a quien lo esté monitoreando.

> Control remoto web: [`/control/`](/control/) · En local la API corre en `http://localhost:8000`; en el servidor EC2, en `http://<IP-pública>:8000`.

---

### Cómo empezar

1. Presiona **Authorize** (arriba a la derecha) y escribe la clave `X-API-Key` (variable `API_KEY` del archivo `.env`).
   Se necesita para todo lo que **modifica, elimina o controla** el vehículo; las consultas `GET` son libres.
2. Abre un grupo, elige una operación y presiona **Try it out → Execute**.
3. Los grupos están en el orden en que normalmente se usan: vehículo → comandos → mover → consultar → DEMO.

### Flujos principales

| Flujo | Qué pasa |
|---|---|
| **Movimiento individual** · `POST /vehiculos/{id}/movimientos` | Valida vehículo y comando → guarda estado **e historial** en una transacción → avisa por WebSocket (`movimiento`). |
| **Consultar historial** · `GET /vehiculos/{id}/historial` | Devuelve **máximo 10** movimientos, del más reciente al más antiguo. |
| **DEMO** · `POST /vehiculos/{id}/demos/{id_demo}/iniciar` | Responde `202` y transmite por WebSocket los N movimientos con su duración y pausa. Actualiza el estado, **no** el historial. |
| **Cancelar** · `POST /vehiculos/{id}/demos/cancelar` | Detiene la DEMO en curso de inmediato. |

### WebSocket (monitoreo en tiempo real)

`ws://<servidor>:8000/ws/vehiculos/{id_vehiculo}` (en local `<servidor>` = `localhost`) — Swagger no puede probar WebSocket; usa Postman o la página `/control/`.
Cada mensaje es JSON con `evento`, `id_vehiculo` y `timestamp`:

| evento | Cuándo llega |
|---|---|
| `estado_actual` | Al conectarse: último comando guardado y si hay una DEMO en curso |
| `movimiento` | Cada movimiento individual registrado |
| `demo_inicio` · `demo_movimiento` · `demo_fin` | Inicio, cada uno de los N pasos (con `duracion_ms` y `pausa_ms`) y final de una DEMO |
| `demo_cancelada` · `demo_error` | La DEMO se canceló o falló |

Enviar el texto `ping` responde `pong`.

### Respuestas de error

| Código | Significado |
|---|---|
| `400` | Regla de negocio no cumplida (vehículo o comando inactivo, DEMO sin movimientos) |
| `401` / `403` | Falta la `X-API-Key` / la clave es incorrecta |
| `404` | No existe, o no pertenece a ese vehículo |
| `409` | Duplicado (nombre, código u orden) o ya hay una DEMO en curso |
| `422` | Datos con formato inválido (tipo, rango o longitud) |
| `503` | La base de datos no responde |

Todos los errores responden `{"detail": "mensaje"}`.
"""

TAGS = [
    {"name": "Vehículos", "description": "Alta, consulta, edición y baja de vehículos. El **detalle** reúne comandos, estado y DEMO en una sola llamada. "
     "SP: sp_crear_vehiculo · sp_obtener_vehiculos · sp_obtener_vehiculo · sp_actualizar_vehiculo · sp_eliminar_vehiculo"},
    {"name": "Comandos", "description": "Catálogo de órdenes que entiende cada vehículo (AVANZAR = código 1, …). Crear un comando **no** mueve el vehículo. "
     "SP: sp_crear_comando · sp_obtener_comandos_vehiculo · sp_actualizar_comando · sp_eliminar_comando"},
    {"name": "Estado", "description": "**Mover el vehículo** y consultar su último comando. SP: sp_actualizar_estado · sp_obtener_estado"},
    {"name": "Historial", "description": "Bitácora de movimientos individuales (los de DEMO no se guardan). SP: sp_registrar_historial · sp_obtener_historial"},
    {"name": "DEMO", "description": "Rutinas automáticas guardadas: una DEMO es una lista ordenada de movimientos. "
     "SP: sp_crear_demo · sp_obtener_demos · sp_actualizar_demo · sp_eliminar_demo"},
    {"name": "Movimientos DEMO", "description": "Pasos de cada DEMO: comando, orden, duración y pausa en milisegundos. "
     "SP: sp_agregar_movimiento_demo · sp_obtener_movimientos_demo · sp_actualizar_movimiento_demo · sp_eliminar_movimiento_demo"},
    {"name": "Ejecución DEMO", "description": "Iniciar o cancelar una DEMO; los pasos se transmiten por WebSocket."},
    {"name": "Sistema", "description": "Comprobación rápida de que la API responde."},
]

PARAMETROS_SWAGGER = {
    "docExpansion": "none",            # grupos cerrados: se ve el índice completo
    "defaultModelsExpandDepth": -1,    # oculta la sección de Schemas al final
    "filter": True,                    # buscador de operaciones
    "tryItOutEnabled": True,
    "persistAuthorization": True,      # recuerda la X-API-Key al recargar
    "displayRequestDuration": True,
    "syntaxHighlight": {"theme": "monokai"},
}


def pagina_docs(openapi_url: str, titulo: str) -> HTMLResponse:
    """Swagger UI con hoja de estilo propia (app/web/docs.css)."""
    html = get_swagger_ui_html(openapi_url=openapi_url, title=f"{titulo} · Documentación",
                               swagger_ui_parameters=PARAMETROS_SWAGGER).body.decode()
    extra = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
             '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700'
             '&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">'
             '<link rel="stylesheet" href="/control/docs.css">')
    return HTMLResponse(html.replace("</head>", extra + "</head>", 1))
