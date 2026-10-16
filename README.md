# API Vehículo IoT — 2.6 Examen Tema 2 (EC2 + RDS)

API en **Python + FastAPI** con **programación orientada a objetos** que controla el vehículo IoT del esquema
`vehiculo_iot` alojado en **Amazon RDS (MySQL)**. Integra los **21 Stored Procedures**, ofrece servicios **GET** y **POST**,
monitoreo y DEMO por **WebSocket seguro (WSS)**, y documentación en **Swagger UI**. Se publica en **Amazon EC2**.

> La versión local de la práctica 2.5 está en la etiqueta [`practica-2.5`](../../tree/practica-2.5).

## Enlaces públicos

| Servicio | URL |
|---|---|
| Swagger UI (HTTPS) | `https://<dominio>/docs` |
| WebSocket (WSS) | `wss://<dominio>/ws/vehiculos/{id_vehiculo}` |
| Simulador de DEMO | `https://<dominio>/control/simulador.html` |
| Control remoto | `https://<dominio>/control/` |

## Simulador de DEMO

`/control/simulador.html` arma un escenario completo contra la API real: crea un vehículo, registra sus comandos,
crea una DEMO de **N** movimientos, abre el WebSocket del vehículo, inicia la DEMO y muestra en vivo `demo_inicio`,
cada `demo_movimiento` y `demo_fin`. Al final consulta el historial para comprobar que la DEMO no lo modificó.
Pide la `X-API-Key` porque crea registros.

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
wss://<dominio>/ws/vehiculos/{id_vehiculo}      # público (EC2, detrás de HTTPS)
ws://localhost:8000/ws/vehiculos/{id_vehiculo}  # local
```

Se pueden abrir varios clientes al mismo vehículo; si se pierde la conexión, el cliente se reconecta y vuelve a
recibir `estado_actual` con el último estado guardado en RDS.

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

## Despliegue en EC2 (práctica 2.6)

1. En el servidor (Windows Server) copia o clona el proyecto, por ejemplo en `C:\vehiculo_iot_api`.
2. PowerShell **como administrador** en esa carpeta:
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\instalar-servidor.ps1   # venv, dependencias, .env y firewall 8000
   powershell -ExecutionPolicy Bypass -File deploy\iniciar-servidor.ps1    # uvicorn --host 0.0.0.0 --port 8000
   ```
3. En AWS:
   - Security Group del EC2: regla de entrada **TCP 8000** (origen 0.0.0.0/0 o tu IP).
   - Security Group de RDS: regla **MySQL 3306** con origen el Security Group (o la IP privada) del EC2.
4. HTTPS/WSS: Caddy funciona como proxy inverso en los puertos 80/443, obtiene el certificado de Let's Encrypt
   y reenvía todo a `localhost:8000` (incluido el WebSocket). El dominio se forma con la IP elástica en
   `sslip.io` (por ejemplo `13-218-5-111.sslip.io`). En el Security Group del EC2 se abren **TCP 80 y 443**.
5. Prueba desde fuera: `https://<dominio>/docs`, `https://<dominio>/control/simulador.html` y `wss://<dominio>/ws/vehiculos/1`.
