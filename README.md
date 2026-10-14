# API Vehículo IoT — Práctica 2.5 (entorno Dev)

API en **Python + FastAPI** con **programación orientada a objetos** que controla el vehículo IoT del esquema
`vehiculo_iot` alojado en **Amazon RDS (MySQL)**. Integra los **21 Stored Procedures**, ofrece servicios **GET** y **POST**,
monitoreo y DEMO por **WebSocket**, y documentación en **Swagger UI**.

> Solo se ejecuta en local (`http://localhost:8000`). El despliegue público con HTTPS/WSS corresponde a la práctica 2.6.

## Arquitectura

```
app/
├── main.py                  # Crea la app FastAPI, registra rutas y traduce errores a códigos HTTP
├── config.py                # Configuracion: lee el .env (RDS y API_KEY)
├── dependencias.py          # Contenedor: arma una sola vez repositorio, servicios y ejecutor; valida X-API-Key
├── errores.py               # Errores de negocio (400, 403, 404, 409)
├── db/conexion.py           # BaseDatos / Sesion: conexión a RDS, transacciones y callproc con parámetros enlazados
├── repositorios/
│   └── procedimientos.py    # RepositorioSP: un método por cada uno de los 21 SP (sin reglas de negocio)
├── servicios/
│   ├── vehiculos.py         # ServicioVehiculos, ServicioComandos
│   ├── movimientos.py       # ServicioEstado, ServicioHistorial (límite 10), ServicioMovimientos (transacción)
│   └── demos.py             # ServicioDemos (catálogo) y EjecutorDemos (tarea asíncrona, cancelación)
├── tiempo_real/gestor.py    # GestorWebSocket: clientes agrupados por vehículo
├── modelos/esquemas.py      # Modelos Pydantic de entrada y salida
└── rutas/                   # Endpoints: vehiculos, estado/historial, demos, ws
```

Las rutas solo reciben y responden; las reglas viven en los **servicios** y el acceso a datos en el **repositorio**.

## Ejecución local

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # y llena el endpoint de RDS, usuario, contraseña y API_KEY
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs

El Security Group de RDS debe permitir **MySQL/Aurora TCP 3306** solo desde **My IP**.

## Seguridad

- Las credenciales viven en `.env` (excluido por `.gitignore`); en el repo solo está `.env.example` sin secretos.
- Las operaciones que modifican, eliminan o controlan el vehículo exigen el encabezado `X-API-Key`
  (sin él → **401**, incorrecto → **403**). Las consultas GET son públicas y nunca modifican datos.
- Todos los SP se ejecutan con `callproc` (parámetros enlazados); nunca se concatena SQL.

## Endpoints y Stored Procedures

| Método | Ruta | SP |
|---|---|---|
| GET | `/vehiculos` | sp_obtener_vehiculos |
| GET | `/vehiculos/{id}` | sp_obtener_vehiculo |
| GET | `/vehiculos/{id}/detalle` | sp_obtener_vehiculo, sp_obtener_comandos_vehiculo, sp_obtener_estado, sp_obtener_demos |
| POST | `/vehiculos` | sp_crear_vehiculo |
| POST | `/vehiculos/{id}/actualizar` | sp_actualizar_vehiculo |
| POST | `/vehiculos/{id}/eliminar` | sp_eliminar_vehiculo |
| GET | `/vehiculos/{id}/comandos` | sp_obtener_comandos_vehiculo |
| POST | `/vehiculos/{id}/comandos` | sp_crear_comando |
| POST | `/vehiculos/{id}/comandos/{id_comando}/actualizar` | sp_actualizar_comando |
| POST | `/vehiculos/{id}/comandos/{id_comando}/eliminar` | sp_eliminar_comando |
| GET | `/vehiculos/{id}/estado` | sp_obtener_estado |
| POST | `/vehiculos/{id}/movimientos` | sp_actualizar_estado + sp_registrar_historial (una transacción) |
| GET | `/vehiculos/{id}/historial` | sp_obtener_historial (máx. 10) |
| GET | `/vehiculos/{id}/demos` | sp_obtener_demos |
| POST | `/vehiculos/{id}/demos` | sp_crear_demo |
| POST | `/vehiculos/{id}/demos/{id_demo}/actualizar` | sp_actualizar_demo |
| POST | `/vehiculos/{id}/demos/{id_demo}/eliminar` | sp_eliminar_demo |
| GET | `/vehiculos/{id}/demos/{id_demo}/movimientos` | sp_obtener_movimientos_demo |
| POST | `/vehiculos/{id}/demos/{id_demo}/movimientos` | sp_agregar_movimiento_demo |
| POST | `/vehiculos/{id}/demos/{id_demo}/movimientos/{id_mov}/actualizar` | sp_actualizar_movimiento_demo |
| POST | `/vehiculos/{id}/demos/{id_demo}/movimientos/{id_mov}/eliminar` | sp_eliminar_movimiento_demo |
| POST | `/vehiculos/{id}/demos/{id_demo}/iniciar` | sp_obtener_movimientos_demo + sp_actualizar_estado (sin historial) |
| POST | `/vehiculos/{id}/demos/cancelar` | — (detiene la DEMO en curso) |

Códigos usados: 200, 201, 202, 400, 401, 403, 404, 409, 422, 500 y 503.

## Reglas de negocio

- **Movimiento individual**: valida que el vehículo exista y esté activo, y que el comando exista, esté activo y
  sea de ese vehículo. Luego ejecuta `sp_actualizar_estado` y `sp_registrar_historial` en **una transacción**; solo
  después del commit se notifica por WebSocket. Si se rechaza, no cambia nada. El campo `conectado` conserva su valor
  actual: recibir un HTTP no prueba que el vehículo esté conectado.
- **Historial**: devuelve como máximo los **10** movimientos individuales más recientes (del más nuevo al más viejo);
  si hay menos, solo los disponibles. El historial completo sigue en RDS.
- **DEMO**: lee sus N movimientos con `sp_obtener_movimientos_demo`, los transmite en orden respetando
  `duracion_ms` y `pausa_ms`, y actualiza el estado; **nunca** llama a `sp_registrar_historial`.
  Corre como tarea asíncrona (no bloquea otras peticiones), solo una por vehículo (otra → **409**) y se puede cancelar.

## WebSocket

```
ws://localhost:8000/ws/vehiculos/{id_vehiculo}
```

Cada cliente recibe solo los eventos de su vehículo; se admiten varios clientes a la vez. Enviar `ping` responde `pong`.
Todos los mensajes llevan `evento`, `id_vehiculo` y `timestamp`.

| evento | Cuándo | Campos extra |
|---|---|---|
| `estado_actual` | Al conectarse | id_comando, comando, codigo, conectado, fecha_actualizacion, demo_en_curso, clientes |
| `movimiento` | Tras un POST de movimiento individual exitoso | id_comando, comando, codigo, origen |
| `demo_inicio` | Al iniciar una DEMO | id_demo, demo, total_movimientos |
| `demo_movimiento` | Por cada uno de los N movimientos | numero, orden, id_comando, comando, codigo, duracion_ms, pausa_ms |
| `demo_fin` | Al terminar la DEMO | movimientos_enviados, historial |
| `demo_cancelada` | Al cancelar | movimientos_enviados |
| `demo_error` / `error` | Falla de datos, RDS o vehículo inexistente | detalle |

Ejemplo:

```json
{"evento":"demo_movimiento","id_vehiculo":1,"id_demo":1,"demo":"Demo principal","numero":1,"total_movimientos":8,
 "orden":1,"id_comando":1,"comando":"AVANZAR","codigo":1,"duracion_ms":2000,"pausa_ms":400,
 "timestamp":"2026-10-14T17:23:40.120000+00:00"}
```

Un mensaje enviado no significa que el vehículo físico lo ejecutó: la confirmación del ESP8266/ESP32 se agregará después.
