/* Portal API Vehículo IoT: rutas, comprobaciones con evidencia y guía detallada del examen 2.6 */
(() => {
'use strict';

/* ======================= Utilidades ======================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const API = location.origin;
const WSB = API.replace(/^http/, 'ws');
const REPO = 'Moy-Gz04/vehiculo-iot-api';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const iconos = () => window.lucide && lucide.createIcons({ attrs: { class: 'i' } });
const dormir = ms => new Promise(r => setTimeout(r, ms));
const movimiento = !matchMedia('(prefers-reduced-motion: reduce)').matches && window.gsap;
const hora = () => new Date().toLocaleTimeString('es-MX', { hour12: false });
const json = (o, max = 60) => { const t = JSON.stringify(o, null, 2) ?? ''; const l = t.split('\n'); return l.length > max ? l.slice(0, max).join('\n') + `\n… (${l.length - max} líneas más)` : t; };

function clave() { try { return localStorage.getItem('ctl.apikey') || ''; } catch { return ''; } }
function ponerClave(v) { try { v ? localStorage.setItem('ctl.apikey', v) : localStorage.removeItem('ctl.apikey'); } catch {} pintarClave(); }

/* Petición HTTP que además guarda lo enviado para mostrarlo como evidencia (la clave se enmascara) */
async function pedir(ruta, { metodo = 'GET', cuerpo, conClave = false, claveFija, timeout = 12000 } = {}) {
  const url = ruta.startsWith('http') ? ruta : API + ruta;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  const headers = { Accept: 'application/json' };
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  if (claveFija !== undefined) headers['X-API-Key'] = claveFija; else if (conClave && clave()) headers['X-API-Key'] = clave();
  const visible = { ...headers }; if (visible['X-API-Key'] && claveFija === undefined) visible['X-API-Key'] = '•••••••• (tu clave)';
  const req = { metodo, url, headers: visible, cuerpo };
  const t0 = performance.now();
  try {
    const r = await fetch(url, { method: metodo, headers, body: cuerpo !== undefined ? (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) : undefined, signal: ctl.signal });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
    return { status: r.status, ok: r.ok, json: j, txt, ms: Math.round(performance.now() - t0), req };
  } catch (e) { return { status: 0, ok: false, json: null, txt: '', ms: Math.round(performance.now() - t0), error: e.name, req }; }
  finally { clearTimeout(t); }
}
/* Evidencia: petición y respuesta en texto */
function ev(r, recorte) {
  const q = r.req; const hd = Object.entries(q.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
  const body = q.cuerpo === undefined ? '' : `\n\n${typeof q.cuerpo === 'string' ? q.cuerpo : JSON.stringify(q.cuerpo, null, 2)}`;
  const cuerpoRes = r.json !== null ? json(recorte ? recorte(r.json) : r.json) : (r.txt || '').slice(0, 600) + ((r.txt || '').length > 600 ? '\n…' : '');
  return { req: `${q.metodo} ${q.url}\n${hd}${body}`, res: cuerpoRes || '(sin cuerpo)', status: r.status, ms: r.ms };
}
const evTexto = (req, res, status = '', ms = '') => ({ req, res, status, ms });

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('ver'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('ver'), 2200); }
async function copiar(txt) { try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { toast('No se pudo copiar'); } }

/* Cliente WebSocket con espera de eventos */
function abrirWS(idV, alMensaje) {
  return new Promise((ok, mal) => {
    const ws = new WebSocket(`${WSB}/ws/vehiculos/${idV}`);
    const espera = []; ws.recibidos = [];
    ws.esperar = (evento, ms = 7000) => new Promise((res, rej) => {
      const ya = ws.recibidos.find(m => m.evento === evento && !m._usado); if (ya) { ya._usado = true; return res(ya); }
      const t = setTimeout(() => rej(new Error(`no llegó ${evento}`)), ms); espera.push({ evento, res, t });
    });
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.evento === 'pong') return;
      alMensaje && alMensaje(m);
      const i = espera.findIndex(x => x.evento === m.evento);
      if (i >= 0) { const [x] = espera.splice(i, 1); clearTimeout(x.t); m._usado = true; x.res(m); }
      ws.recibidos.push(m);
    };
    ws.onopen = () => ok(ws);
    ws.onerror = () => mal(new Error('no se pudo abrir el WebSocket'));
    setTimeout(() => ws.readyState !== 1 && mal(new Error('tiempo agotado')), 8000);
  });
}
const limpio = m => { const { _usado, ...r } = m; return r; };

/* Bloque de código copiable */
const bloque = (etiqueta, texto) => `<div class="bloque"><div class="cab"><span>${esc(etiqueta)}</span><button data-copiar="${esc(texto)}"><i data-lucide="copy" class="i" style="width:12px;height:12px"></i>Copiar</button></div><pre>${esc(texto)}</pre></div>`;

/* Ampliar un marco a toda la pantalla */
function ampliar(el) {
  const on = !el.classList.contains('enfoque');
  el.classList.toggle('enfoque', on); document.body.classList.toggle('con-enfoque', on);
  const b = $('[data-ampliar]', el); if (b) { b.innerHTML = on ? '<i data-lucide="minimize-2" class="i"></i>Salir' : '<i data-lucide="maximize-2" class="i"></i>Ampliar'; iconos(); }
  if (on && el.requestFullscreen && matchMedia('(min-width: 861px)').matches) el.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { const e = $('.enfoque'); if (e) ampliar(e); } });
document.addEventListener('click', e => {
  const c = e.target.closest('[data-copiar]'); if (c) { e.preventDefault(); copiar(c.dataset.copiar); }
  const a = e.target.closest('[data-ampliar]'); if (a) ampliar(a.closest('.marco, .codigo-lay'));
});

/* ======================= Estado global ======================= */
const resultados = {}, detalles = {};
let cacheSistema = null, cacheCodigo = null, cachePoo = null;
const funcion = (clase, metodo) => cachePoo?.flatMap(m => m.clases.map(c => ({ ...c, mod: m.modulo }))).find(c => c.nombre === clase)?.detalle.find(d => d.nombre === metodo);

/* ======================= Criterios del examen ======================= */
const C = [
{
  id: 'python', tec: 'Python', titulo: 'Código funcional y dependencias', pts: 5, icono: 'file-code-2',
  revisa: ['El proyecto corre en Python', 'Dependencias fijadas en requirements.txt', 'Código organizado por módulos'],
  intro: 'La API está escrita en Python y sus dependencias están fijadas con versión exacta en requirements.txt. Aquí se recorre el código real que ejecuta el servidor, archivo por archivo.',
  extra: { tab: 'Código', icono: 'folder-tree', render: renderCodigo },
  async verificar() {
    const s = await pedir('/portal/api/sistema'); const c = [];
    if (!s.ok) return [{ t: 'Servidor de la API', ok: false, det: `No respondió (${s.status || s.error})`, ev: ev(s) }];
    cacheSistema = s.json;
    c.push({ t: `Python ${s.json.python} está ejecutando la API`, ok: true, det: `${s.json.implementacion} · ${s.json.sistema} · servidor ${s.json.servidor}`,
      porque: 'Esta respuesta la genera el propio proceso de Python que atiende la API (platform.python_version()). Si Python no estuviera corriendo, el servidor no podría contestar.', ev: ev(s, j => ({ python: j.python, implementacion: j.implementacion, sistema: j.sistema, servidor: j.servidor, uptime_s: j.uptime_s })) });
    const deps = s.json.dependencias, bien = deps.filter(d => d.instalada === d.requerida);
    c.push({ t: `${bien.length} de ${deps.length} dependencias instaladas con la versión exacta de requirements.txt`, ok: bien.length === deps.length, det: deps.map(d => `${d.paquete}==${d.instalada}`).join(' · '),
      porque: 'El servidor lee requirements.txt y lo compara con lo realmente instalado en su entorno virtual (importlib.metadata). Coinciden versión por versión.', ev: ev(s, j => j.dependencias) });
    const cod = await pedir('/portal/api/codigo');
    if (cod.ok) { cacheCodigo = cod.json; const py = cod.json.filter(f => f.ruta.endsWith('.py'));
      c.push({ t: `${py.length} módulos Python organizados por responsabilidad`, ok: py.length >= 10, det: `${py.reduce((a, f) => a + f.lineas, 0).toLocaleString('es-MX')} líneas · el .env nunca se expone`,
        porque: 'Son los archivos que el servidor está ejecutando ahora mismo, no una copia. Están separados en db, repositorios, servicios, rutas, modelos y tiempo_real.', ev: evTexto(`GET ${API}/portal/api/codigo`, cod.json.map(f => `${f.ruta.padEnd(36)} ${String(f.lineas).padStart(4)} líneas`).join('\n'), cod.status, cod.ms) }); }
    return c;
  },
  pasos: [
    { t: 'Muestra el código y las dependencias', donde: 'Portal → Python → pestaña Código', p: 'Abre requirements.txt y luego app/main.py. Explica que cada paquete tiene versión exacta.', espera: 'Se ven fastapi, pydantic, PyMySQL, uvicorn, websockets, python-dotenv y cryptography con su versión.' },
    { t: 'Comprueba Python en el servidor', donde: 'AWS → EC2 → Server1 → Conectar → Session Manager (PowerShell)', p: 'Pega estas líneas una por una:', code: [['Versión de Python del proyecto', 'C:\\vehiculo_iot_api\\.venv\\Scripts\\python.exe --version'], ['Paquetes instalados', 'C:\\vehiculo_iot_api\\.venv\\Scripts\\python.exe -m pip freeze']], espera: 'La versión de Python y la misma lista de paquetes que requirements.txt.' },
    { t: 'Comprueba que la API está corriendo', donde: 'Session Manager (PowerShell)', code: [['Estado de la tarea', 'Get-ScheduledTask "API Vehiculo IoT" | Select-Object TaskName, State']], espera: 'State: Running.' },
    { t: 'Abre la raíz de la API', donde: 'Navegador', code: [['URL', `${API}/`]], espera: '{"api":"Vehículo IoT","estado":"en línea", …}' },
  ],
},
{
  id: 'fastapi', tec: 'FastAPI', titulo: 'GET/POST, respuestas y validaciones', pts: 10, icono: 'braces',
  revisa: ['Servicios GET y POST', 'Códigos de respuesta correctos', 'Validación de entradas y errores'],
  intro: 'FastAPI expone los GET (consultas) y POST (acciones) y valida cada petición con modelos Pydantic. La comprobación hace peticiones reales a la API pública y provoca a propósito cada tipo de respuesta. Abre cada fila para ver la petición exacta y la respuesta del servidor.',
  async verificar() {
    const c = [];
    let r = await pedir('/vehiculos');
    c.push({ t: 'GET /vehiculos responde 200 con la lista de RDS', ok: r.status === 200 && Array.isArray(r.json), det: `${r.status} · ${Array.isArray(r.json) ? r.json.length + ' vehículos' : ''} · ${r.ms} ms`,
      porque: 'Una consulta GET válida debe responder 200 con un JSON. El arreglo viene de sp_obtener_vehiculos en Amazon RDS.', ev: ev(r) });
    r = await pedir('/vehiculos/999999');
    c.push({ t: 'GET de un recurso inexistente responde 404', ok: r.status === 404, det: `${r.status} · ${r.json?.detail ?? ''}`,
      porque: 'La API no inventa datos ni truena: el servicio busca el vehículo, no lo encuentra y lanza NoEncontrado, que FastAPI convierte en 404 con un mensaje claro.', ev: ev(r) });
    r = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL' } });
    c.push({ t: 'POST sin X-API-Key responde 401', ok: r.status === 401, det: `${r.status} · ${r.json?.detail ?? ''}`,
      porque: 'Las operaciones que mueven o modifican datos dependen de requiere_api_key(). Sin encabezado se rechaza antes de llegar a los Stored Procedures.', ev: ev(r) });
    r = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL' }, claveFija: 'clave-incorrecta' });
    c.push({ t: 'POST con clave incorrecta responde 403', ok: r.status === 403, det: `${r.status} · ${r.json?.detail ?? ''}`,
      porque: '401 significa "no te identificaste"; 403 significa "te identificaste pero no tienes permiso". La API distingue los dos casos.', ev: ev(r) });
    if (clave()) {
      r = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 'texto' }, conClave: true });
      c.push({ t: 'POST con body inválido responde 422 (validación Pydantic)', ok: r.status === 422, det: `${r.status} · ${r.json?.detail?.[0]?.msg ?? ''}`,
        porque: 'El modelo MovimientoIndividual declara id_comando como entero. FastAPI valida el JSON antes de ejecutar la función y responde 422 indicando el campo exacto (loc) que falló.', ev: ev(r) });
      r = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL-FASTAPI' }, conClave: true });
      c.push({ t: 'POST válido responde 200 y devuelve el estado actualizado', ok: r.status === 200, det: `${r.status} · ${r.json?.comando ?? ''} · clientes_notificados ${r.json?.clientes_notificados ?? ''}`,
        porque: 'Con clave y cuerpo correctos la API ejecuta la acción y responde con el modelo de salida: el comando registrado y el nuevo estado leído de RDS.', ev: ev(r) });
    } else c.push({ t: 'POST con body inválido (422) y POST válido (200)', ok: null, det: 'Guarda la clave con el botón de la barra superior para ejecutar estas dos pruebas' });
    r = await pedir('/openapi.json');
    const ops = r.json ? Object.entries(r.json.paths).flatMap(([p, o]) => Object.keys(o).map(m => `${m.toUpperCase().padEnd(5)} ${p}`)) : [];
    c.push({ t: `${ops.length} operaciones GET y POST publicadas`, ok: ops.length >= 20, det: `${ops.filter(o => o.startsWith('GET')).length} GET · ${ops.filter(o => o.startsWith('POST')).length} POST`,
      porque: 'FastAPI genera este contrato (OpenAPI) a partir del código: cada ruta declarada aparece con su método.', ev: evTexto(`GET ${API}/openapi.json`, ops.join('\n'), r.status, r.ms) });
    return c;
  },
  pasos: [
    { t: 'Ejecuta la comprobación frente al profe', donde: 'Portal → FastAPI → Comprobación en vivo', p: 'Pulsa Verificar y abre cada fila: se ve la petición que se mandó y la respuesta real del servidor.', espera: '200, 404, 401, 403, 422 y 200 con su explicación.' },
    { t: 'GET correcto', donde: 'VS Code → Thunder Client → New Request', p: 'Método GET, pega la URL y pulsa Send:', code: [['URL', `${API}/vehiculos`]], espera: 'Status 200 OK y un arreglo JSON de vehículos.' },
    { t: 'GET de un vehículo que no existe', donde: 'Thunder Client', code: [['URL', `${API}/vehiculos/999999`]], espera: '404 Not Found · "El vehículo 999999 no existe".' },
    { t: 'POST sin clave y con clave incorrecta', donde: 'Thunder Client → método POST', p: 'Pega la URL, en Body → JSON pega el cuerpo y envía sin headers (401). Luego en Headers agrega X-API-Key con valor "mal" (403).', code: [['URL', `${API}/vehiculos/1/movimientos`], ['Body → JSON', '{"id_comando": 1, "origen": "THUNDER-CLIENT"}']], espera: '401 "Falta el encabezado X-API-Key" y luego 403 "La X-API-Key no es válida".' },
    { t: 'Validación 422', donde: 'Thunder Client → misma petición con la clave correcta', p: 'En Headers pon X-API-Key con tu clave y cambia el body a:', code: [['Body → JSON', '{"id_comando": "texto"}']], espera: '422 con detail[0].loc = ["body","id_comando"]: FastAPI señala el campo inválido.' },
    { t: 'Muestra dónde se valida', donde: 'Portal → POO → Arquitectura (o VS Code)', p: 'Abre app/modelos/esquemas.py, clase MovimientoIndividual: id_comando es int y origen tiene longitud máxima. Eso es lo que produce el 422.' },
  ],
},
{
  id: 'poo', tec: 'Programación Orientada a Objetos', titulo: 'Clases, módulos y separación de responsabilidades', pts: 10, icono: 'boxes',
  revisa: ['Clases con una sola responsabilidad', 'Módulos separados por capa', 'Las rutas no acceden directo a la base'],
  intro: 'La API está organizada en capas y cada clase tiene una sola responsabilidad. El diagrama se genera leyendo el código real del servidor: despliega cualquier clase y toca un método para ver su código.',
  extra: { tab: 'Arquitectura', icono: 'network', render: renderPoo },
  async verificar() {
    const r = await pedir('/portal/api/poo'); if (!r.ok) return [{ t: 'Análisis del código', ok: false, det: String(r.status) }];
    cachePoo = r.json; const c = [];
    const todas = r.json.flatMap(m => m.clases.map(k => ({ ...k, mod: m.modulo })));
    c.push({ t: `${todas.length} clases en ${r.json.length} módulos`, ok: todas.length >= 10, det: todas.map(k => k.nombre).slice(0, 14).join(' · ') + (todas.length > 14 ? ' …' : ''),
      porque: 'El servidor analiza su propio código con el módulo ast de Python y lista las clases que encuentra en cada archivo.', ev: evTexto(`GET ${API}/portal/api/poo`, todas.map(k => `${k.mod.padEnd(34)} class ${k.nombre}${k.bases.length ? '(' + k.bases.join(', ') + ')' : ''}  · ${k.metodos.length} métodos`).join('\n'), r.status, r.ms) });
    const claves = ['Configuracion', 'BaseDatos', 'Sesion', 'RepositorioSP', 'ServicioMovimientos', 'EjecutorDemos', 'GestorWebSocket', 'Contenedor'];
    const faltan = claves.filter(k => !todas.some(x => x.nombre === k));
    const cont = funcion('Contenedor', '__init__');
    c.push({ t: 'Cada capa es una clase distinta y el Contenedor las une', ok: !faltan.length, det: faltan.length ? 'Faltan: ' + faltan.join(', ') : 'Configuracion → BaseDatos → RepositorioSP → Servicios → GestorWebSocket',
      porque: 'El Contenedor crea una sola vez cada objeto y le pasa sus dependencias por el constructor (inyección de dependencias). Este es su código real:', ev: cont && evTexto('app/dependencias.py · Contenedor.__init__', cont.codigo) });
    const rutas = r.json.filter(m => m.modulo.startsWith('app/rutas/') && !m.modulo.endsWith('portal.py'));
    const directas = rutas.filter(m => m.importa.includes('db') || m.importa.includes('repositorios'));
    c.push({ t: 'Las rutas no importan la base de datos ni el repositorio', ok: !directas.length, det: directas.length ? directas.map(m => m.modulo).join(', ') : 'Las rutas solo usan servicios',
      porque: 'Separación de responsabilidades: una ruta solo recibe y responde. Estos son los módulos de app/ que importa cada archivo de rutas; ninguno es db ni repositorios.', ev: evTexto('Imports de app/rutas/*', rutas.map(m => `${m.modulo.padEnd(26)} importa: ${m.importa.join(', ')}`).join('\n')) });
    const repo = todas.find(k => k.nombre === 'RepositorioSP');
    const ejemplo = repo?.detalle.find(d => d.nombre === 'registrar_historial') || repo?.detalle[1];
    c.push({ t: `RepositorioSP tiene ${repo ? repo.metodos.filter(x => x !== '__init__').length : 0} métodos, uno por Stored Procedure`, ok: !!repo && repo.metodos.length >= 21, det: 'Sin reglas de negocio: solo llama al SP con sus parámetros',
      porque: 'El acceso a datos está aislado en una sola clase. Ejemplo de un método:', ev: ejemplo && evTexto(`app/repositorios/procedimientos.py · RepositorioSP.${ejemplo.nombre} (línea ${ejemplo.linea})`, ejemplo.codigo) });
    return c;
  },
  pasos: [
    { t: 'Recorre las capas', donde: 'Portal → POO → pestaña Arquitectura', p: 'De arriba a abajo: Rutas → Contenedor → Servicios → Tiempo real → Repositorio → Conexión → Configuración. Toca un método para ver su código.' },
    { t: 'Sigue un POST de movimiento por las capas', donde: 'Portal → Arquitectura (toca cada método)', p: 'Abre en orden: Rutas · ejecutar_movimiento() → ServicioMovimientos.ejecutar() → RepositorioSP.actualizar_estado() y registrar_historial() → BaseDatos.transaccion().', espera: 'Cada capa hace una sola cosa y llama a la siguiente.' },
    { t: 'Explica la inyección de dependencias', donde: 'Arquitectura → Contenedor', p: 'Contenedor.__init__ crea un solo RepositorioSP y se lo pasa a todos los servicios; así no se abre una conexión por cada ruta y las clases se pueden probar por separado.' },
    { t: 'Explica por qué POO', p: 'Cambiar MySQL local por Amazon RDS solo requirió cambiar el .env (lo lee Configuracion). No se tocó ningún servicio ni ruta. Ese es el beneficio de separar responsabilidades.', code: [['.env.example (plantilla, sin secretos)', 'DB_HOST=<endpoint-de-rds>\nDB_PORT=3306\nDB_USER=admin\nDB_PASSWORD=<contraseña>\nDB_NAME=vehiculo_iot\nAPI_KEY=<clave>']] },
  ],
},
{
  id: 'rds', tec: 'Amazon RDS', titulo: 'Conexión remota segura y persistencia', pts: 10, icono: 'database',
  revisa: ['La API usa Amazon RDS', 'RDS no está abierto a Internet', 'Los datos persisten'],
  intro: 'La base vehiculo_iot vive en Amazon RDS for MySQL. El EC2 se conecta por la red privada de AWS y RDS solo acepta conexiones desde el grupo de seguridad del EC2. La comprobación consulta RDS en vivo.',
  async verificar() {
    const r = await pedir('/portal/api/rds', { timeout: 20000 });
    if (!r.ok || !r.json?.conectado) return [{ t: 'Conexión con la base de datos', ok: false, det: r.json?.error || String(r.status), ev: ev(r) }];
    const d = r.json, c = [];
    c.push({ t: d.es_rds ? `La API está conectada a Amazon RDS (${d.region})` : 'Conectado a MySQL local (no es RDS)', ok: d.es_rds, det: `${d.host} · base ${d.base}`,
      porque: 'El host de la conexión termina en .rds.amazonaws.com: es el endpoint de la instancia RDS. Se muestra enmascarado para no exponer la dirección completa.', ev: ev(r, j => ({ host: j.host, es_rds: j.es_rds, region: j.region, base: j.base })) });
    c.push({ t: d.ip_privada ? 'La conexión viaja por IP privada dentro de AWS' : 'El endpoint se resuelve a una IP pública', ok: d.ip_privada === true, det: 'RDS no es "Accesible públicamente"; el grupo rds-iot-sg solo permite 3306 desde server1-sg',
      porque: 'Desde el EC2 el endpoint de RDS se resuelve a una dirección privada (10.x / 172.16-31.x), así que el tráfico nunca sale a Internet. Además el grupo de seguridad de RDS solo acepta al grupo del EC2.', ev: ev(r, j => ({ ip_privada: j.ip_privada })) });
    c.push({ t: `MySQL ${d.version} respondió en ${d.latencia_ms} ms`, ok: true, det: `${d.edicion} · hora del servidor ${d.hora_servidor}`,
      porque: 'Es una consulta real (SELECT VERSION(), NOW()) ejecutada en RDS en este momento; la hora cambia en cada verificación.', ev: ev(r, j => ({ version: j.version, edicion: j.edicion, hora_servidor: j.hora_servidor, latencia_ms: j.latencia_ms })) });
    const total = d.tablas.reduce((a, t) => a + t.filas, 0);
    c.push({ t: `${d.tablas.length} tablas con ${total.toLocaleString('es-MX')} registros persistidos`, ok: d.tablas.length >= 6, det: d.tablas.map(t => `${t.tabla} ${t.filas}`).join(' · '),
      porque: 'COUNT(*) real de cada tabla. Haz un movimiento y vuelve a verificar: historial_comandos aumenta. Reinicia la API y el número se mantiene: eso es persistencia.', ev: ev(r, j => j.tablas) });
    return c;
  },
  pasos: [
    { t: 'Muestra la instancia', donde: 'AWS → RDS → Bases de datos → instancia-rds-iot', p: 'Pestaña Conectividad y seguridad.', espera: 'Estado "Disponible", motor MySQL, endpoint …us-east-1.rds.amazonaws.com y "Accesible públicamente: No".' },
    { t: 'Muestra el grupo de seguridad', donde: 'RDS → Conectividad y seguridad → rds-iot-sg → Reglas de entrada', espera: 'Una sola regla: MySQL/Aurora 3306 con origen el grupo server1-sg (no 0.0.0.0/0).' },
    { t: 'Prueba la conexión desde el EC2', donde: 'Session Manager (PowerShell)', p: 'Sustituye <endpoint-de-rds> por el endpoint de la consola:', code: [['Prueba de red al puerto 3306', 'Test-NetConnection <endpoint-de-rds> -Port 3306'], ['IP a la que se resuelve', 'Resolve-DnsName <endpoint-de-rds>']], espera: 'TcpTestSucceeded: True y una IP privada (172.31.x.x).' },
    { t: 'Demuestra persistencia', donde: 'Thunder Client + Portal', p: 'Verifica en el portal y anota el conteo de historial_comandos. Haz un POST de movimiento y verifica otra vez. Luego reinicia la API:', code: [['Session Manager', 'Stop-ScheduledTask "API Vehiculo IoT"; Start-ScheduledTask "API Vehiculo IoT"']], espera: 'El conteo sube con el POST y se mantiene después del reinicio.' },
  ],
},
{
  id: 'mysql', tec: 'MySQL', titulo: 'Uso funcional de los 21 Stored Procedures', pts: 10, icono: 'table-2',
  revisa: ['Existen los 21 SP en vehiculo_iot', 'Cada SP lo usa un endpoint', 'Se conservan nombres y parámetros'],
  intro: 'La comprobación lee information_schema de RDS para listar los procedimientos con sus parámetros y muestra cuántas veces la API ha ejecutado cada uno desde que arrancó: es la evidencia de uso real.',
  extra: { tab: 'Procedimientos', icono: 'list-tree', render: renderSP },
  async verificar() {
    const r = await pedir('/portal/api/sp', { timeout: 20000 }); if (!r.ok) return [{ t: 'Lectura de information_schema', ok: false, det: String(r.status), ev: ev(r) }];
    const d = r.json, c = [];
    c.push({ t: `${d.total} de ${d.esperados} Stored Procedures existen en RDS`, ok: d.total >= d.esperados, det: 'Consultado en information_schema.ROUTINES',
      porque: 'La lista sale de la propia base de datos, no del código: SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE().', ev: evTexto('information_schema.ROUTINES', d.procedimientos.map(p => `${p.sp}(${p.parametros.join(', ')})`).join('\n'), r.status, r.ms) });
    const sinMapa = d.procedimientos.filter(p => p.grupo === 'Otro');
    c.push({ t: 'Cada procedimiento lo usa un endpoint de la API', ok: !sinMapa.length, det: '5 vehículos · 4 comandos · 2 estado · 2 historial · 4 DEMO · 4 movimientos DEMO',
      porque: 'Cada SP corresponde a un método de RepositorioSP y ese método lo llama un servicio expuesto por un endpoint.', ev: evTexto('SP → endpoint', d.procedimientos.map(p => `${p.sp.padEnd(32)} ${p.endpoint}`).join('\n')) });
    const usados = d.procedimientos.filter(p => p.llamadas > 0);
    c.push({ t: `${usados.length} procedimientos ya ejecutados por la API desde su arranque`, ok: usados.length > 0, det: `${d.procedimientos.reduce((a, p) => a + p.llamadas, 0)} llamadas reales · con callproc y parámetros enlazados`,
      porque: 'Cada vez que BaseDatos ejecuta un SP lo registra. Estos contadores suben solo si la API realmente llamó al procedimiento en RDS.', ev: evTexto('Ejecuciones desde el arranque', d.procedimientos.filter(p => p.llamadas).map(p => `${String(p.llamadas).padStart(5)}  ${p.sp}`).join('\n') || 'Sin llamadas aún') });
    return c;
  },
  pasos: [
    { t: 'Muestra los 21 SP con su uso', donde: 'Portal → MySQL → pestaña Procedimientos', p: 'Pulsa "Probar consultas": los contadores de los SP de lectura suben en vivo.' },
    { t: 'Muéstralos directo en la base', donde: 'Cliente MySQL conectado a RDS (VS Code Database Client / Workbench)', code: [['Lista de procedimientos', "SHOW PROCEDURE STATUS WHERE Db = 'vehiculo_iot';"], ['Código de uno', 'SHOW CREATE PROCEDURE sp_registrar_historial;']], espera: '21 filas y el CREATE PROCEDURE con sus parámetros originales.' },
    { t: 'Relaciona SP con código', donde: 'Portal → Python → Código → app/repositorios/procedimientos.py', p: 'Cada método llama a un SP con su nombre exacto mediante self.db.llamar("sp_…", parámetros).' },
    { t: 'Demuestra movimiento contra DEMO', donde: 'Portal → Procedimientos', p: 'Haz un POST de movimiento: suben sp_actualizar_estado y sp_registrar_historial. Corre una DEMO: sube sp_obtener_movimientos_demo y sp_actualizar_estado, pero no sp_registrar_historial.', espera: 'Por eso la DEMO no deja registros en el historial.' },
  ],
},
{
  id: 'wss', tec: 'WebSocket (WSS)', titulo: 'Último estado, evento POST, DEMO N pasos y reconexión', pts: 25, icono: 'radio',
  revisa: ['Último estado al conectar', 'Evento tras un POST en varios clientes', 'DEMO con N pasos temporizados', 'Reconexión'],
  intro: 'El WebSocket seguro es el canal que en el futuro moverá al vehículo. La comprobación abre dos clientes WSS reales al mismo vehículo; en el Laboratorio se repite paso a paso frente al profe.',
  extra: { tab: 'Laboratorio', icono: 'flask-conical', render: renderLab },
  async verificar() {
    const c = [];
    c.push({ t: location.protocol === 'https:' ? 'El canal es WSS (WebSocket cifrado con TLS)' : 'Canal ws:// sin cifrar (entorno local)', ok: location.protocol === 'https:', det: `${WSB}/ws/vehiculos/{id}`,
      porque: 'La página se sirve por HTTPS, así que el navegador solo permite WebSocket seguro (wss://). Caddy termina el TLS con el mismo certificado del dominio.' });
    let A, B;
    try {
      [A, B] = await Promise.all([abrirWS(1), abrirWS(1)]);
      const [ea, eb] = await Promise.all([A.esperar('estado_actual'), B.esperar('estado_actual')]);
      c.push({ t: 'Dos clientes reciben el último estado guardado en RDS al conectarse', ok: true, det: `A: ${ea.comando} · B: ${eb.comando} · clientes ${eb.clientes ?? 2}`,
        porque: 'Al aceptar la conexión, la API consulta sp_obtener_estado y envía estado_actual solo a ese cliente.', ev: evTexto(`WSS ${WSB}/ws/vehiculos/1  (cliente A y cliente B)`, `A ← ${JSON.stringify(limpio(ea))}\n\nB ← ${JSON.stringify(limpio(eb))}`) });
      if (clave()) {
        const pa = A.esperar('movimiento'), pb = B.esperar('movimiento');
        const r = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL-WSS' }, conClave: true });
        const [ma, mb] = await Promise.all([pa, pb]);
        c.push({ t: 'Un POST válido llega como evento a los dos clientes', ok: r.ok && !!ma && !!mb, det: `POST ${r.status} · clientes_notificados ${r.json?.clientes_notificados} · ${ma.comando} (${ma.origen})`,
          porque: 'Después del commit en RDS, la ruta publica el evento movimiento a todos los clientes del vehículo 1. La respuesta HTTP informa a cuántos llegó.', ev: { ...ev(r), res: `HTTP ${r.status}\n${json(r.json)}\n\nA ← ${JSON.stringify(limpio(ma))}\nB ← ${JSON.stringify(limpio(mb))}` } });
      } else c.push({ t: 'Evento tras un POST', ok: null, det: 'Guarda la clave para enviar el POST de prueba' });
      B.close(); await dormir(400);
      const B2 = await abrirWS(1); const er = await B2.esperar('estado_actual');
      c.push({ t: 'Reconexión: el cliente vuelve a recibir el último estado', ok: true, det: `estado_actual → ${er.comando}`,
        porque: 'Si se pierde la conexión, al volver a conectar el cliente recibe de nuevo el estado más reciente desde RDS; no se queda con datos viejos.', ev: evTexto('B se desconecta y vuelve a conectar', `B ← ${JSON.stringify(limpio(er))}`) }); B2.close();
      const d = await pedir('/vehiculos/1/demos'); const idD = d.json?.[0]?.id_demo;
      if (idD) { const m = await pedir(`/vehiculos/1/demos/${idD}/movimientos`);
        c.push({ t: `La DEMO ${idD} tiene ${m.json?.length ?? 0} pasos temporizados listos para transmitir`, ok: (m.json?.length ?? 0) > 0, det: 'Ejecútala en el Laboratorio para ver demo_inicio, los N demo_movimiento y demo_fin',
          porque: 'Estos son los pasos que la DEMO enviará por WSS, en este orden y con estos tiempos (sp_obtener_movimientos_demo).', ev: ev(m, j => j.map(x => `${x.orden}. ${x.comando}  ${x.duracion_ms} ms + ${x.pausa_ms} ms`)) }); }
    } catch (e) { c.push({ t: 'Conexión WebSocket', ok: false, det: e.message }); }
    finally { A?.close(); B?.close(); }
    return c;
  },
  pasos: [
    { t: 'Abre el primer cliente WSS', donde: 'VS Code → Postman → New → WebSocket', p: 'Pega la URL y pulsa Connect:', code: [['URL', `${WSB}/ws/vehiculos/1`]], espera: 'Llega {"evento":"estado_actual", …} con el último comando guardado en RDS.' },
    { t: 'Abre el segundo cliente', donde: 'Postman → otra pestaña WebSocket', p: 'Misma URL y Connect.', espera: 'estado_actual con "clientes": 2.' },
    { t: 'Envía un movimiento', donde: 'Thunder Client → POST', code: [['URL', `${API}/vehiculos/1/movimientos`], ['Headers', 'X-API-Key: <tu clave>'], ['Body → JSON', '{"id_comando": 1, "origen": "THUNDER-CLIENT"}']], espera: '200 con "clientes_notificados": 2 y el evento movimiento en las dos pestañas de Postman.' },
    { t: 'Inicia la DEMO', donde: 'Thunder Client → POST (mismo header, sin body)', code: [['URL', `${API}/vehiculos/1/demos/1/iniciar`]], espera: '202 Accepted. En Postman: demo_inicio, N demo_movimiento (cada uno tras duracion_ms + pausa_ms) y demo_fin.' },
    { t: 'Intenta otra DEMO mientras corre', donde: 'Thunder Client', p: 'Vuelve a pulsar Send en la misma petición antes de que termine.', espera: '409 "El vehículo 1 ya está ejecutando una DEMO".' },
    { t: 'Cancela', donde: 'Thunder Client → POST (mismo header)', code: [['URL', `${API}/vehiculos/1/demos/cancelar`]], espera: 'demo_cancelada en Postman con los movimientos que alcanzaron a enviarse.' },
    { t: 'Reconecta', donde: 'Postman', p: 'Pulsa Disconnect y luego Connect. Para probar que el canal sigue vivo, escribe ping en Message y pulsa Send.', espera: 'Vuelve a llegar estado_actual; ping responde pong.' },
  ],
},
{
  id: 'swagger', tec: 'Swagger UI', titulo: 'Documentación HTTP pública en HTTPS', pts: 5, icono: 'book-open-text',
  revisa: ['Swagger UI disponible públicamente', 'Servido por HTTPS', 'Endpoints con parámetros, respuestas y SP'],
  intro: 'Swagger UI se genera desde el código de FastAPI. Cada operación describe parámetros, respuestas, errores y los Stored Procedures que ejecuta.',
  extra: { tab: 'Vista previa', icono: 'monitor', render: el => { el.append(guiaSwagger()); el.append(marco('/docs', 'Swagger UI', '640px')); } },
  async verificar() {
    const c = [];
    const d = await pedir('/docs');
    c.push({ t: 'Swagger UI responde en /docs', ok: d.status === 200 && /swagger/i.test(d.txt), det: `${d.status} · ${d.ms} ms`, porque: 'La página que entrega el servidor carga swagger-ui y apunta a /openapi.json.', ev: evTexto(`GET ${API}/docs`, d.txt.slice(0, 500) + '\n…', d.status, d.ms) });
    c.push({ t: location.protocol === 'https:' ? 'Publicado por HTTPS con certificado válido' : 'Servido por HTTP (entorno local)', ok: location.protocol === 'https:', det: `${API}/docs`, porque: 'El navegador solo carga https:// sin advertencias si el certificado es válido para el dominio (emitido por Let\'s Encrypt).' });
    const o = await pedir('/openapi.json');
    if (o.json) {
      const ops = Object.entries(o.json.paths).flatMap(([p, x]) => Object.entries(x).map(([m, op]) => ({ p, m, op })));
      const conSP = ops.filter(x => /sp_/.test(x.op.description || ''));
      const ej = ops.find(x => x.p === '/vehiculos/{id_vehiculo}/movimientos' && x.m === 'post');
      c.push({ t: `${ops.length} operaciones · ${conSP.length} indican los Stored Procedures que usan`, ok: conSP.length >= 15, det: `${(o.json.tags || []).length} grupos documentados`,
        porque: 'Ejemplo real de cómo está documentada una operación (descripción, parámetros y respuestas posibles):', ev: ej && evTexto(`POST ${ej.p}`, json({ resumen: ej.op.summary, descripcion: ej.op.description, parametros: (ej.op.parameters || []).map(x => x.name), respuestas: Object.keys(ej.op.responses || {}) })) });
    }
    return c;
  },
  pasos: [
    { t: 'Abre la URL pública', donde: 'Navegador', code: [['URL', `${API}/docs`]], espera: 'Candado en la barra de direcciones y la lista de grupos.' },
    { t: 'Autoriza', donde: 'Swagger → botón Authorize (arriba a la derecha)', p: 'En X-API-Key pega tu clave, pulsa Authorize y Close.' },
    { t: 'Prueba un GET', donde: 'Swagger → grupo Historial → GET /vehiculos/{id_vehiculo}/historial', p: 'Try it out → id_vehiculo = 1 → Execute.', espera: 'Code 200 y máximo 10 movimientos.' },
    { t: 'Prueba un POST', donde: 'Swagger → grupo Estado → POST /vehiculos/{id_vehiculo}/movimientos', p: 'Try it out → id_vehiculo = 1 → pega el body → Execute.', code: [['Request body', '{"id_comando": 1, "origen": "SWAGGER"}']], espera: 'Code 200 "Movimiento registrado". Arriba de la operación se ve qué SP ejecuta.' },
  ],
},
{
  id: 'thunder', tec: 'Thunder Client', titulo: 'Tres escenarios públicos: GET, POST y WSS', pts: 10, icono: 'zap',
  revisa: ['GET historial (máx. 10)', 'POST movimiento con notificación WSS', 'DEMO por WSS sin historial'],
  intro: 'Thunder Client es la herramienta que pide el examen para HTTP; la versión gratuita no abre WebSocket, por eso la parte WSS se hace con Postman en el mismo VS Code. Aquí están las peticiones listas para copiar y la colección para importar.',
  extra: { tab: 'Peticiones', icono: 'send', render: renderThunder },
  async verificar() {
    const c = [];
    const r = await pedir('/vehiculos/1/historial'); const m = r.json?.movimientos || [];
    const desc = m.every((x, i) => i === 0 || m[i - 1].id_historial > x.id_historial);
    c.push({ t: 'Escenario GET: máximo 10, del más reciente al más antiguo', ok: r.ok && m.length <= 10 && desc, det: `${r.status} · total_devueltos ${r.json?.total_devueltos} · #${m[0]?.id_historial ?? '—'} … #${m.at(-1)?.id_historial ?? '—'}`,
      porque: 'Se verificó que vengan 10 o menos y que cada id_historial sea menor que el anterior.', ev: ev(r) });
    const pr = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'THUNDER-CLIENT' } });
    c.push({ t: 'Escenario POST disponible y protegido', ok: pr.status === 401, det: 'Sin clave responde 401; en Thunder Client se agrega el header X-API-Key', porque: 'Confirma que la ruta existe y exige clave, tal como se configurará en Thunder.', ev: ev(pr) });
    const d = await pedir('/vehiculos/1/demos');
    c.push({ t: 'Escenario WSS: DEMO registrada en RDS', ok: (d.json?.length ?? 0) > 0, det: d.json?.[0] ? `DEMO ${d.json[0].id_demo} · ${d.json[0].nombre}` : 'Sin DEMO', ev: ev(d) });
    c.push({ t: 'Capturas en Thunder Client y Postman', ok: null, det: 'Se toman en VS Code siguiendo la pestaña Peticiones' });
    return c;
  },
  pasos: [
    { t: 'Importa la colección', donde: 'VS Code → Thunder Client (ícono de rayo) → Collections → menú ≡ → Import', p: 'Descarga la colección en la pestaña Peticiones e impórtala. Luego en Env crea la variable apikey con tu clave.' },
    { t: 'Abre dos clientes WSS en Postman', donde: 'VS Code → Postman → New → WebSocket (dos pestañas)', code: [['URL', `${WSB}/ws/vehiculos/1`]], espera: 'estado_actual en las dos.' },
    { t: 'Escenario 1 · POST', donde: 'Thunder Client → "1 · POST movimiento"', espera: '200 · clientes_notificados: 2 · evento movimiento en las dos pestañas de Postman.' },
    { t: 'Escenario 2 · GET', donde: 'Thunder Client → "2 · GET historial"', espera: 'limite 10 · total_devueltos ≤ 10 · ids del mayor al menor · el POST anterior aparece primero.' },
    { t: 'Escenario 3 · DEMO', donde: 'Thunder Client → "3 · POST iniciar DEMO"', espera: '202 · en Postman demo_inicio, N demo_movimiento y demo_fin · GET historial sin cambios · GET estado = último paso.' },
  ],
},
{
  id: 'github', tec: 'Git / GitHub', titulo: 'Control de versiones y despliegue desde repositorio', pts: 5, icono: 'git-branch',
  revisa: ['Repositorio público verificable', 'Historial de commits', 'Sin .env ni contraseñas'],
  intro: 'El código está versionado en GitHub y el servidor se actualiza descargando el repositorio. La comprobación consulta la API de GitHub en vivo.',
  extra: { tab: 'Commits', icono: 'git-commit-horizontal', render: renderGithub },
  async verificar() {
    const c = [];
    const r = await pedir(`https://api.github.com/repos/${REPO}`);
    if (!r.ok) return [{ t: 'Consulta a GitHub', ok: false, det: r.status === 403 ? 'Límite de consultas de GitHub alcanzado; intenta en unos minutos' : String(r.status || r.error) }];
    c.push({ t: `Repositorio ${r.json.full_name} ${r.json.private ? 'privado' : 'público'}`, ok: !r.json.private, det: `rama ${r.json.default_branch} · actualizado ${new Date(r.json.pushed_at).toLocaleString('es-MX')}`, ev: ev(r, j => ({ full_name: j.full_name, private: j.private, default_branch: j.default_branch, pushed_at: j.pushed_at, html_url: j.html_url })) });
    const cm = await pedir(`https://api.github.com/repos/${REPO}/commits?per_page=100`);
    c.push({ t: `${cm.json?.length ?? 0} commits en el historial`, ok: (cm.json?.length ?? 0) >= 5, det: cm.json?.[0]?.commit?.message.split('\n')[0] ?? '', porque: 'Cada cambio (API, Swagger, EC2, HTTPS, simulador, portal) quedó registrado con su mensaje.', ev: evTexto(`GET api.github.com/repos/${REPO}/commits`, (cm.json || []).map(x => `${x.sha.slice(0, 7)}  ${x.commit.message.split('\n')[0]}`).join('\n')) });
    const raiz = await pedir(`https://api.github.com/repos/${REPO}/contents/`);
    const nombres = (raiz.json || []).map(f => f.name);
    c.push({ t: 'El repositorio no contiene .env ni contraseñas', ok: !nombres.includes('.env') && nombres.includes('.env.example'), det: nombres.join(' · '), porque: '.gitignore excluye .env; solo se publica .env.example con valores de ejemplo.', ev: evTexto('Raíz del repositorio', nombres.join('\n')) });
    const tags = await pedir(`https://api.github.com/repos/${REPO}/tags`);
    c.push({ t: `${tags.json?.length ?? 0} etiqueta(s) de versión`, ok: (tags.json?.length ?? 0) > 0, det: (tags.json || []).map(t => t.name).join(' · ') });
    return c;
  },
  pasos: [
    { t: 'Abre el repositorio', donde: 'Navegador', code: [['URL', `https://github.com/${REPO}`]], espera: 'Código, README con eventos WSS, requirements.txt y deploy/.' },
    { t: 'Muestra el historial', donde: 'GitHub → Commits', p: 'Los mensajes documentan la evolución: API, Swagger, EC2, HTTPS, simulador y portal.' },
    { t: 'Muestra que no hay secretos', donde: 'GitHub → .gitignore', espera: 'Incluye .env, .venv y __pycache__; solo existe .env.example.' },
    { t: 'Explica el despliegue desde GitHub', donde: 'Session Manager (PowerShell)', p: 'Así se actualiza el servidor con la versión de GitHub:', code: [['Actualizar desde main', '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Remove-Item $env:TEMP\\api -Recurse -Force -ErrorAction SilentlyContinue; Invoke-WebRequest https://github.com/Moy-Gz04/vehiculo-iot-api/archive/refs/heads/main.zip -OutFile $env:TEMP\\api.zip -UseBasicParsing; Expand-Archive $env:TEMP\\api.zip $env:TEMP\\api -Force; Copy-Item "$env:TEMP\\api\\vehiculo-iot-api-main\\*" C:\\vehiculo_iot_api -Recurse -Force; Stop-ScheduledTask "API Vehiculo IoT"; Start-ScheduledTask "API Vehiculo IoT"']] },
  ],
},
{
  id: 'ec2', tec: 'Amazon EC2 y publicación', titulo: 'Servidor persistente, dominio y HTTPS/WSS', pts: 10, icono: 'server',
  revisa: ['API en EC2 sin depender de VS Code', 'Dominio fijo', 'HTTPS y WSS'],
  intro: 'La API corre en Amazon EC2 como tarea programada, detrás de Caddy, que publica HTTPS/WSS con certificado de Let\'s Encrypt. La IP elástica mantiene el dominio aunque se reinicie la instancia.',
  async verificar() {
    const c = []; const sr = await pedir('/portal/api/sistema'); const s = sr.json;
    c.push({ t: location.protocol === 'https:' ? 'Servido por HTTPS con certificado válido' : 'Servido por HTTP', ok: location.protocol === 'https:', det: location.host, porque: 'Si el certificado no fuera válido, el navegador mostraría una advertencia y no cargaría la página ni el WebSocket.' });
    c.push({ t: /sslip\.io$/.test(location.hostname) ? 'Dominio público ligado a la IP elástica' : 'Dominio local', ok: /sslip\.io$/.test(location.hostname), det: location.hostname, porque: '13-218-5-111.sslip.io siempre resuelve a 13.218.5.111, la IP elástica de Server1, que no cambia al reiniciar.' });
    if (s) {
      c.push({ t: `API en ${s.servidor} encendida desde hace ${(s.uptime_s / 3600).toFixed(1)} h`, ok: true, det: `${s.sistema} · proceso independiente de VS Code`, porque: 'El nombre del servidor es el de la instancia EC2 y el tiempo encendido lo cuenta el proceso de la API, que corre como tarea programada.', ev: ev(sr, j => ({ servidor: j.servidor, sistema: j.sistema, uptime_s: j.uptime_s, protocolo: j.protocolo, host: j.host })) });
      c.push({ t: 'Caddy recibe HTTPS y lo entrega a la API', ok: s.protocolo === 'https', det: `X-Forwarded-Proto: ${s.protocolo}`, porque: 'La API ve el encabezado que pone Caddy indicando que la petición original llegó cifrada.' });
    }
    try { const w = await abrirWS(1); const e = await w.esperar('estado_actual'); w.close(); c.push({ t: 'WSS accesible desde un cliente externo', ok: true, det: `${WSB}/ws/vehiculos/1`, ev: evTexto(`WSS ${WSB}/ws/vehiculos/1`, JSON.stringify(limpio(e), null, 2)) }); }
    catch (e) { c.push({ t: 'WSS accesible desde un cliente externo', ok: false, det: e.message }); }
    return c;
  },
  pasos: [
    { t: 'Muestra la instancia', donde: 'AWS → EC2 → Instancias', espera: 'Server1 "En ejecución", 3/3 comprobaciones e IP elástica 13.218.5.111.' },
    { t: 'Demuestra que no depende de VS Code', p: 'Cierra VS Code y recarga este portal en el celular.', espera: 'Todo sigue funcionando.' },
    { t: 'Muestra las tareas programadas', donde: 'Session Manager (PowerShell)', code: [['Estado', 'Get-ScheduledTask "API Vehiculo IoT", "Caddy HTTPS" | Select-Object TaskName, State']], espera: 'Las dos en Running y con disparador "Al iniciar el sistema".' },
    { t: 'Muestra el certificado', donde: 'Navegador → clic en el candado → Certificado', espera: 'Emitido para 13-218-5-111.sslip.io por Let\'s Encrypt.' },
    { t: 'Muestra los puertos', donde: 'EC2 → Grupos de seguridad → server1-sg → Reglas de entrada', espera: '443 y 80 (HTTPS y emisión del certificado) y 8000; RDS solo acepta al EC2.' },
  ],
},
];
C.forEach((c, i) => c.num = i + 1);

/* ======================= Navegación ======================= */
function pintarNav() {
  $('#nav-guia').innerHTML = C.map(c => `<a href="#/guia/${c.id}" data-ruta="guia/${c.id}"><span class="num">${String(c.num).padStart(2, '0')}</span><span>${esc(c.tec)}</span><span class="pts">${c.pts}</span><span class="punto" data-punto="${c.id}"></span></a>`).join('');
}
function marcarNav(ruta) { $$('#nav a').forEach(a => a.setAttribute('aria-current', a.dataset.ruta === ruta ? 'page' : 'false')); $('#lado').classList.remove('abierto'); }
function pintarPuntos() {
  for (const c of C) $$(`[data-punto="${c.id}"]`).forEach(p => p.className = 'punto ' + (resultados[c.id] || ''));
  const ganados = C.filter(c => resultados[c.id] === 'ok').reduce((a, c) => a + c.pts, 0);
  const ring = $('#anillo-valor'); if (ring) { ring.style.strokeDashoffset = 314 * (1 - ganados / 100); $('#anillo-cifra').textContent = ganados; }
  $$('[data-criterio-estado]').forEach(el => { const r = resultados[el.dataset.criterioEstado]; el.className = 'chip ' + ({ ok: 'ok', mal: 'mal', av: 'av' }[r] || ''); el.textContent = { ok: 'Verificado', mal: 'Falla', av: 'Parcial' }[r] || 'Pendiente'; });
}

const RUTAS = { inicio: vInicio, api: vApi, simulador: vSimulador, control: vControl };
let rutaActual = '';
async function navegar() {
  const ruta = (location.hash.replace(/^#\/?/, '') || 'inicio');
  if (ruta === rutaActual) return; rutaActual = ruta;
  const e = $('.enfoque'); if (e) ampliar(e);
  $('#modal-clave').hidden = true; $('#modal-codigo').hidden = true;
  const vista = $('#vista');
  if (movimiento && vista.children.length) await gsap.to(vista, { opacity: 0, y: 6, duration: .14, ease: 'power1.in' });
  vista.innerHTML = ''; vista.className = 'vista';
  const [base, id] = ruta.split('/');
  let titulo = 'Inicio';
  const c = base === 'guia' && C.find(x => x.id === id);
  if (c) { vGuia(vista, c); titulo = `${c.num}. ${c.tec}`; }
  else { (RUTAS[base] || vInicio)(vista); titulo = { inicio: 'Inicio', api: 'API Vehículo IoT', simulador: 'Simulador DEMO', control: 'Control real' }[base] || 'Inicio'; }
  $('#miga b').textContent = titulo; document.title = `${titulo} · Portal Vehículo IoT`;
  marcarNav(c ? ruta : (RUTAS[base] ? base : 'inicio'));
  iconos(); pintarPuntos(); window.scrollTo({ top: 0 });
  if (movimiento) {
    gsap.fromTo(vista, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out' });
    gsap.from($$('[data-entra]', vista), { opacity: 0, y: 14, duration: .45, stagger: .045, ease: 'power2.out', delay: .05, clearProps: 'all' });
  }
}

/* ======================= Vistas ======================= */
function vInicio(v) {
  v.append(h(`<section class="hero" data-entra><div class="rejilla"></div><div class="hero-cuerpo">
    <div>
      <span class="eyebrow"><i data-lucide="activity" class="i"></i>2.6 Examen Tema 2 · Arquitectura y tecnologías de IoT</span>
      <h1 class="t">API Vehículo IoT</h1>
      <p class="lead">FastAPI con programación orientada a objetos en Amazon EC2, datos en Amazon RDS con 21 Stored Procedures y un WebSocket seguro que transmite el estado y las DEMO en tiempo real.</p>
      <div class="acciones"><button class="btn pri" id="verificar-todo"><i data-lucide="shield-check" class="i"></i>Verificar los 10 criterios</button><a class="btn sec" href="#/guia/python"><i data-lucide="list-checks" class="i"></i>Abrir la guía</a></div>
    </div>
    <div class="puntaje">
      <div class="anillo"><svg viewBox="0 0 120 120"><circle class="fondo" cx="60" cy="60" r="50" fill="none" stroke-width="10"/><circle id="anillo-valor" class="valor" cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-dasharray="314" stroke-dashoffset="314"/></svg><div class="cifra"><div><b id="anillo-cifra">0</b><span>de 100</span></div></div></div>
      <ul>${C.map(c => `<li><span class="punto" data-punto="${c.id}"></span>${esc(c.tec)}<span class="mono" style="margin-left:auto;color:var(--tenue)">${c.pts}</span></li>`).join('')}</ul>
    </div></div></section>`));
  v.append(h(`<div class="seccion estado-vivo" data-entra>${kpi('api', 'activity', 'API')}${kpi('rds', 'database', 'Amazon RDS')}${kpi('sp', 'table-2', 'Stored Procedures')}${kpi('wss', 'radio', 'WebSocket')}${kpi('https', 'lock', 'Publicación')}</div>`));
  v.append(h(`<div class="seccion grid g3" data-entra>
    ${acceso('api', 'braces', 'API Vehículo IoT', 'Swagger UI con una guía para probar GET y POST y ver qué SP usa cada operación.')}
    ${acceso('simulador', 'route', 'Simulador DEMO', 'Crea un vehículo con N movimientos, arma su DEMO y mírala en vivo por WebSocket.')}
    ${acceso('control', 'gamepad-2', 'Control real', 'El control remoto del vehículo: RC clásico y Gamepad, conectado al mismo WebSocket.')}</div>`));
  const lista = h(`<div class="seccion" data-entra><div class="seccion-cab"><div><span class="eyebrow">Guía del examen</span><h2 class="t">Lo que revisará el profesor</h2></div><span class="muted mono" style="font-size:12px">Cada criterio: comprobación con evidencia y pasos detallados</span></div><div class="criterios"></div></div>`);
  $('.criterios', lista).innerHTML = C.map(c => `<a class="criterio" href="#/guia/${c.id}"><span class="n">${String(c.num).padStart(2, '0')}</span><div><b>${esc(c.tec)}</b><small>${esc(c.titulo)}</small></div><div class="d"><span class="chip" data-criterio-estado="${c.id}">Pendiente</span><span class="chip">${c.pts} pts</span></div></a>`).join('');
  v.append(lista);
  $('#verificar-todo', v).addEventListener('click', verificarTodo);
  estadoInicio();
}
const kpi = (id, ic, k) => `<div class="tarjeta kpi" id="kpi-${id}"><div class="k"><i data-lucide="${ic}" class="i" style="width:13px;height:13px"></i>${k}</div><div class="v">—</div><div class="s">comprobando…</div></div>`;
const acceso = (ruta, ic, t, p) => `<a class="tarjeta acceso" href="#/${ruta}"><span class="ic"><i data-lucide="${ic}" class="i"></i></span><h3 class="t">${t}</h3><p>${p}</p><span class="ir">Abrir <i data-lucide="arrow-right" class="i" style="width:14px;height:14px"></i></span></a>`;
function ponKpi(id, v, s, mal) { const el = $(`#kpi-${id}`); if (!el) return; $('.v', el).textContent = v; $('.s', el).textContent = s; $('.v', el).style.color = mal ? 'var(--mal)' : ''; }
function estadoInicio() {
  pedir('/').then(r => ponKpi('api', r.ok ? 'En línea' : 'Sin respuesta', r.ok ? `GET / · ${r.ms} ms` : String(r.status), !r.ok));
  pedir('/portal/api/rds', { timeout: 20000 }).then(r => r.json?.conectado ? ponKpi('rds', `${r.json.latencia_ms} ms`, `MySQL ${r.json.version} · ${r.json.region || 'local'}`) : ponKpi('rds', 'Sin conexión', r.json?.error || '', true));
  pedir('/portal/api/sp', { timeout: 20000 }).then(r => r.ok ? ponKpi('sp', `${r.json.total}/${r.json.esperados}`, `${r.json.procedimientos.reduce((a, p) => a + p.llamadas, 0)} ejecuciones`) : ponKpi('sp', '—', String(r.status), true));
  abrirWS(1).then(async w => { const e = await w.esperar('estado_actual').catch(() => null); w.close(); ponKpi('wss', e ? 'Conectado' : 'Sin estado', e ? `último estado ${e.comando}` : ''); }).catch(e => ponKpi('wss', 'Sin conexión', e.message, true));
  ponKpi('https', location.protocol === 'https:' ? 'HTTPS' : 'HTTP', location.hostname);
}
async function verificarTodo() {
  const b = $('#verificar-todo'); if (b) { b.disabled = true; b.innerHTML = '<i data-lucide="loader-2" class="i girando"></i>Verificando…'; iconos(); }
  for (const c of C) { await correr(c); pintarPuntos(); }
  if (b) { b.disabled = false; b.innerHTML = '<i data-lucide="shield-check" class="i"></i>Verificar de nuevo'; iconos(); }
  toast(`${C.filter(c => resultados[c.id] === 'ok').reduce((a, c) => a + c.pts, 0)} de 100 puntos verificados en vivo`);
}
async function correr(c) {
  let checks; try { checks = await c.verificar(); } catch (e) { checks = [{ t: 'Error al verificar', ok: false, det: e.message }]; }
  detalles[c.id] = checks;
  const fallas = checks.filter(x => x.ok === false).length, pend = checks.filter(x => x.ok === null).length;
  resultados[c.id] = fallas ? 'mal' : pend ? 'av' : 'ok';
  return checks;
}

/* Marco con barra, ampliar y abrir aparte */
function marco(src, titulo, alto) {
  return h(`<div class="marco" data-entra><div class="marco-cab"><div class="luces"><i></i><i></i><i></i></div><div class="url">${esc(API + src)}</div>
    <button class="btn chico sec" data-ampliar><i data-lucide="maximize-2" class="i"></i>Ampliar</button>
    <a class="btn chico sec" href="${src}" target="_blank" rel="noopener"><i data-lucide="external-link" class="i"></i>Aparte</a></div>
    <iframe src="${src}" title="${esc(titulo)}" style="height:${alto}"></iframe></div>`);
}
function introGuia(titulo, pasos, id) {
  const oculto = (() => { try { return localStorage.getItem('portal.intro.' + id) === '0'; } catch { return false; } })();
  const el = h(`<div class="intro" data-entra><div class="intro-cab"><b><i data-lucide="compass" class="i" style="vertical-align:-3px;margin-right:6px"></i>${esc(titulo)}</b><button class="btn chico sec" data-plegar>${oculto ? 'Mostrar guía' : 'Ocultar guía'}</button></div>
    <ol ${oculto ? 'hidden' : ''}>${pasos.map(([t, p], i) => `<li><span class="n">${i + 1}</span><div><b>${esc(t)}</b>${esc(p)}</div></li>`).join('')}</ol></div>`);
  $('[data-plegar]', el).onclick = () => { const ol = $('ol', el); ol.hidden = !ol.hidden; $('[data-plegar]', el).textContent = ol.hidden ? 'Mostrar guía' : 'Ocultar guía'; try { localStorage.setItem('portal.intro.' + id, ol.hidden ? '0' : '1'); } catch {} };
  return el;
}
const guiaSwagger = () => introGuia('Cómo usar Swagger UI', [
  ['Autoriza', 'Botón Authorize (arriba a la derecha): pega tu X-API-Key, Authorize y Close.'],
  ['Elige una operación', 'Abre un grupo (Vehículos, Estado, Historial, DEMO…) y toca la operación.'],
  ['Try it out', 'Llena los parámetros (id_vehiculo = 1) y, si es POST, el Request body.'],
  ['Execute', 'Abajo aparecen el comando curl, la URL, el código y el JSON de respuesta.'],
], 'swagger');
function cabVista(eyebrow, titulo, texto, extra = '') { return h(`<div class="seccion-cab" data-entra style="margin-bottom:14px"><div><span class="eyebrow">${eyebrow}</span><h1 class="t" style="margin-bottom:6px">${titulo}</h1><p class="lead">${texto}</p></div>${extra}</div>`); }
function vApi(v) {
  v.classList.add('ancha');
  v.append(cabVista('Swagger UI · OpenAPI', 'API Vehículo IoT', 'Documentación generada por FastAPI. Sigue la guía para probar las operaciones; usa Ampliar para verla a pantalla completa.'));
  v.append(guiaSwagger(), marco('/docs', 'Swagger UI', 'calc(100vh - 200px)'));
}
function vSimulador(v) {
  v.classList.add('ancha');
  v.append(cabVista('Simulador · WebSocket', 'Simulador DEMO', 'Crea un vehículo con sus comandos, arma una DEMO de N movimientos y mírala llegar por WebSocket.'));
  v.append(introGuia('Cómo usar el simulador', [
    ['Clave', 'Se toma la X-API-Key guardada en este navegador (botón Clave de arriba).'],
    ['Escenario', 'Escribe el nombre del carro, cuántos movimientos (N), su duración y pausa.'],
    ['Crear y ejecutar', 'El simulador crea el vehículo, sus 5 comandos y la DEMO con N pasos, abre el WSS y la inicia.'],
    ['Comprueba', 'Mira cada evento llegar y el carrito moverse; al final verifica que el historial no cambió.'],
  ], 'simulador'), marco('/control/simulador.html', 'Simulador DEMO', 'calc(100vh - 200px)'));
}
function vControl(v) {
  v.classList.add('ancha');
  v.append(h(`<div class="control-lay">
    <div data-entra>
      <span class="eyebrow">Control remoto · WSS</span><h1 class="t">Control real</h1>
      <p class="lead">El mismo control que usa el vehículo físico. Cada botón llama a la API y el ESP32 escucha el WebSocket del vehículo para mover los motores.</p>
      <div class="acciones" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><a class="btn pri" href="/control/" target="_blank" rel="noopener"><i data-lucide="maximize" class="i"></i>Abrir el control a pantalla completa</a></div>
      <div class="nota cta-movil"><i data-lucide="smartphone" class="i"></i><div>En el celular, ábrelo a pantalla completa y gira el teléfono en horizontal: el control está diseñado para usarse así.</div></div>
      <div class="seccion grid g2">
        <div class="tarjeta p"><h3 class="t">RC clásico</h3><p class="muted" style="margin:6px 0 0;font-size:13.5px">Un pulso: el vehículo sigue la acción hasta que eliges otra o presionas ALTO. Cada toque es un POST que queda en el historial.</p></div>
        <div class="tarjeta p"><h3 class="t">Gamepad</h3><p class="muted" style="margin:6px 0 0;font-size:13.5px">Se mueve mientras mantienes el botón; mantener y soltar viajan por el WebSocket sin latencia HTTP.</p></div>
        <div class="tarjeta p"><h3 class="t">Flujo de una orden</h3><p class="muted" style="margin:6px 0 0;font-size:13.5px">Control → API en EC2 (valida la clave) → SP en RDS → evento WSS → ESP32 → motores, en menos de un segundo.</p></div>
        <div class="tarjeta p"><h3 class="t">Acceso</h3><p class="muted" style="margin:6px 0 0;font-size:13.5px">El control pide la X-API-Key al entrar y la recuerda en ese dispositivo.</p></div>
      </div>
    </div>
    <div class="telefono" data-entra><iframe src="/control/" title="Control real del vehículo"></iframe></div>
  </div>`));
}

/* ----- Página de criterio ----- */
function vGuia(v, c) {
  v.append(h(`<div class="guia-cab" data-entra><div><span class="eyebrow"><i data-lucide="${c.icono}" class="i"></i>Criterio ${c.num} de ${C.length}</span><h1 class="t">${esc(c.tec)}</h1><p class="lead">${esc(c.intro)}</p></div>
    <div class="medalla"><div><b>${c.pts}</b><span>puntos</span></div><span class="chip" data-criterio-estado="${c.id}">Pendiente</span></div></div>`));
  v.append(h(`<div class="revisa" data-entra><span class="chip ac"><i data-lucide="eye" class="i" style="width:13px;height:13px"></i>Qué revisa</span>${c.revisa.map(r => `<span class="chip">${esc(r)}</span>`).join('')}</div>`));
  const tabs = [{ id: 'comprobar', nom: 'Comprobación en vivo', ic: 'shield-check' }];
  if (c.extra) tabs.push({ id: 'extra', nom: c.extra.tab, ic: c.extra.icono });
  tabs.push({ id: 'demostrar', nom: 'Cómo demostrarlo', ic: 'presentation' });
  const barra = h(`<div class="pestanas" role="tablist" data-entra>${tabs.map((t, i) => `<button role="tab" aria-selected="${i === 0}" data-tab="${t.id}"><i data-lucide="${t.ic}" class="i" style="width:14px;height:14px"></i>${esc(t.nom)}</button>`).join('')}</div>`);
  const panel = h('<div data-entra></div>');
  v.append(barra, panel);
  const mostrar = id => {
    $$('button', barra).forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
    panel.innerHTML = '';
    if (id === 'comprobar') panelComprobar(panel, c);
    else if (id === 'extra') c.extra.render(panel);
    else panelPasos(panel, c);
    iconos();
    if (movimiento) gsap.from(panel.children, { opacity: 0, y: 8, duration: .3, stagger: .03, clearProps: 'all' });
  };
  barra.addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostrar(b.dataset.tab); });
  mostrar('comprobar');
  const i = C.indexOf(c), ant = C[i - 1], sig = C[i + 1];
  v.append(h(`<div class="seccion" style="display:flex;justify-content:space-between;gap:10px">${ant ? `<a class="btn sec" href="#/guia/${ant.id}"><i data-lucide="arrow-left" class="i"></i>${esc(ant.tec)}</a>` : '<span></span>'}${sig ? `<a class="btn sec" href="#/guia/${sig.id}">${esc(sig.tec)}<i data-lucide="arrow-right" class="i"></i></a>` : '<a class="btn sec" href="#/inicio">Volver al inicio</a>'}</div>`));
}

function panelPasos(panel, c) {
  panel.append(h(`<ol class="pasos">${c.pasos.map(s => `<li><div>
    ${s.donde ? `<span class="donde"><i data-lucide="map-pin" class="i" style="width:12px;height:12px"></i>${esc(s.donde)}</span>` : ''}
    <b>${esc(s.t)}</b>${s.p ? `<p>${esc(s.p)}</p>` : ''}
    ${(s.code || []).map(([l, t]) => bloque(l, t)).join('')}
    ${s.espera ? `<div class="espera"><i data-lucide="circle-check" class="i" style="width:14px;height:14px"></i><span><b style="display:inline;color:inherit">Debe verse:</b> ${esc(s.espera)}</span></div>` : ''}
  </div></li>`).join('')}</ol>`));
}

function panelComprobar(panel, c) {
  panel.append(h(`<div class="seccion-cab"><p class="muted" style="margin:0;font-size:13.5px">Se ejecuta contra la API pública ahora mismo. Abre cada fila para ver <b>por qué cumple</b> y la <b>petición y respuesta reales</b>.</p><button class="btn pri" id="btn-verificar"><i data-lucide="play" class="i"></i>Verificar</button></div>`));
  const lista = h('<div class="checks"></div>'); panel.append(lista);
  const pintar = checks => {
    lista.innerHTML = checks.map((x, i) => {
      const cls = x.ok === true ? 'ok' : x.ok === false ? 'mal' : '';
      const evi = x.porque || x.ev;
      const cuerpo = evi ? `<div class="evidencia">${x.porque ? `<div class="porque"><b>Por qué cumple:</b> ${esc(x.porque)}</div>` : ''}${x.ev ? `<div class="ev-grid"><div class="ev-caja"><div class="cab">Petición</div><pre>${esc(x.ev.req)}</pre></div><div class="ev-caja"><div class="cab">Respuesta ${x.ev.status ? `<span class="chip ${String(x.ev.status).startsWith('2') ? 'ok' : 'mal'}">${x.ev.status}</span>` : ''}${x.ev.ms ? `<span>${x.ev.ms} ms</span>` : ''}</div><pre>${esc(x.ev.res)}</pre></div></div>` : ''}</div>` : '';
      const chip = `<span class="chip ${x.ok === true ? 'ok' : x.ok === false ? 'mal' : 'av'}">${x.ok === true ? 'Cumple' : x.ok === false ? 'No cumple' : 'Manual'}</span>`;
      return `<details class="check ${cls}" ${i === 0 && evi ? 'open' : ''}><summary><span class="ico"><i data-lucide="${x.ok === true ? 'check' : x.ok === false ? 'x' : 'minus'}" class="i" style="width:13px;height:13px"></i></span><div><b>${esc(x.t)}</b><div class="det">${esc(x.det || '')}</div></div>${chip}<i data-lucide="${evi ? 'chevron-right' : 'dot'}" class="i flecha"></i></summary>${cuerpo}</details>`;
    }).join('');
    iconos();
    if (movimiento) gsap.from(lista.children, { opacity: 0, x: -6, duration: .3, stagger: .05, clearProps: 'all' });
  };
  if (detalles[c.id]) pintar(detalles[c.id]); else lista.innerHTML = '<div class="vacio">Pulsa Verificar para ejecutar las comprobaciones.</div>';
  const btn = $('#btn-verificar', panel);
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="i girando"></i>Verificando…'; iconos();
    lista.innerHTML = '<div class="check run"><span class="ico"><i data-lucide="loader-2" class="i girando" style="width:13px;height:13px"></i></span><div><b>Ejecutando comprobaciones…</b></div></div>'; iconos();
    pintar(await correr(c)); pintarPuntos();
    btn.disabled = false; btn.innerHTML = '<i data-lucide="rotate-cw" class="i"></i>Verificar de nuevo'; iconos();
  });
  if (!detalles[c.id]) btn.click();
}

/* ----- Código ----- */
function lineasHtml(texto, lang) {
  let html = esc(texto);
  try { if (window.hljs && lang !== 'plaintext') html = hljs.highlight(texto, { language: lang, ignoreIllegals: true }).value; } catch {}
  return html.split('\n').map(l => `<span class="ln">${l || ' '}</span>`).join('');
}
async function renderCodigo(el) {
  const lay = h(`<div class="codigo-lay"><div class="arbol" aria-label="Archivos"></div><div class="visor"><div class="visor-cab"><i data-lucide="file-code-2" class="i"></i><b id="v-ruta">Cargando…</b><span id="v-lineas" class="muted"></span><span style="flex:1"></span><button class="btn chico sec" id="v-copiar"><i data-lucide="copy" class="i"></i>Copiar</button><button class="btn chico sec" data-ampliar><i data-lucide="maximize-2" class="i"></i>Ampliar</button></div><pre><code id="v-codigo"></code></pre></div></div>`);
  el.append(lay); iconos();
  if (!cacheCodigo) { const r = await pedir('/portal/api/codigo'); cacheCodigo = r.json || []; }
  const grupos = {};
  for (const f of cacheCodigo) { if (f.ruta.endsWith('__init__.py') && f.lineas <= 2) continue; const p = f.ruta.split('/'); (grupos[p.length > 1 ? p.slice(0, -1).join('/') : 'raíz'] ||= []).push(f); }
  const arbol = $('.arbol', lay);
  arbol.innerHTML = Object.entries(grupos).map(([g, fs]) => `<div class="carpeta">${esc(g)}</div>${fs.map(f => `<button data-ruta="${esc(f.ruta)}"><i data-lucide="${f.ruta.endsWith('.py') ? 'file-code' : f.ruta.endsWith('.md') ? 'file-text' : 'file'}" class="i" style="width:14px;height:14px"></i>${esc(f.ruta.split('/').pop())}<small>${f.lineas}</small></button>`).join('')}`).join('');
  iconos();
  const abrir = ruta => {
    const f = cacheCodigo.find(x => x.ruta === ruta); if (!f) return;
    $$('button', arbol).forEach(b => b.setAttribute('aria-current', b.dataset.ruta === ruta));
    $('#v-ruta', lay).textContent = f.ruta; $('#v-lineas', lay).textContent = `· ${f.lineas} líneas`;
    $('#v-codigo', lay).innerHTML = lineasHtml(f.contenido, f.ruta.endsWith('.py') ? 'python' : f.ruta.endsWith('.ps1') ? 'powershell' : f.ruta.endsWith('.md') ? 'markdown' : 'plaintext');
    $('#v-copiar', lay).onclick = () => copiar(f.contenido);
  };
  arbol.addEventListener('click', e => { const b = e.target.closest('button'); if (b) abrir(b.dataset.ruta); });
  abrir(cacheCodigo.find(f => f.ruta === 'requirements.txt') ? 'requirements.txt' : cacheCodigo[0]?.ruta);
}

/* ----- POO ----- */
const CAPAS = [
  ['Rutas', 'app/rutas', 'Reciben la petición, validan con Pydantic y responden. No conocen la base de datos.'],
  ['Contenedor', 'app/dependencias.py', 'Crea una sola vez los objetos y los inyecta; valida la X-API-Key.'],
  ['Servicios', 'app/servicios', 'Reglas de negocio: validar vehículo y comando, transacciones, DEMO asíncrona.'],
  ['Tiempo real', 'app/tiempo_real', 'Clientes WebSocket agrupados por vehículo; un evento solo llega a los suyos.'],
  ['Repositorio', 'app/repositorios', 'Un método por cada uno de los 21 SP, sin reglas de negocio.'],
  ['Conexión', 'app/db', 'Abre la conexión a RDS, maneja commit/rollback y ejecuta callproc con parámetros enlazados.'],
  ['Configuración y modelos', 'app/config.py|app/modelos|app/errores.py', 'Lee el .env, define los JSON de entrada/salida y los errores de negocio.'],
];
function verFuncion(titulo, sub, d, explica) {
  $('#mf-t').textContent = titulo; $('#mf-sub').textContent = sub;
  $('#mf-codigo').innerHTML = lineasHtml(d.codigo, 'python');
  $('#mf-codigo').closest('pre').style.counterReset = `l ${d.linea - 1}`;
  $('#mf-explica').textContent = explica || d.doc || '';
  $('#mf-explica').hidden = !(explica || d.doc);
  $('#mf-copiar').onclick = () => copiar(d.codigo);
  $('#modal-codigo').hidden = false; iconos();
}
$('#mf-cerrar').onclick = () => $('#modal-codigo').hidden = true;
$('#modal-codigo').addEventListener('click', e => { if (e.target.id === 'modal-codigo') $('#modal-codigo').hidden = true; });

async function renderPoo(el) {
  if (!cachePoo) { const r = await pedir('/portal/api/poo'); cachePoo = r.json || []; }
  el.append(h(`<div class="nota" style="margin:0 0 14px"><i data-lucide="lightbulb" class="i"></i><div><b>Por qué se separa así.</b> Cada capa cambia por un solo motivo: si cambia la base (local → RDS) solo cambia la configuración; si cambia una regla, solo el servicio; si cambia la URL, solo la ruta. <b>Despliega una clase y toca un método</b> para ver su código real con su número de línea.</div></div>`));
  const cont = h('<div class="capas"></div>');
  const tarjeta = (titulo, sub, mod, doc, funcs, clave) => `<details class="clase"><summary><b>${esc(titulo)}</b>${sub ? `<span class="mod">${esc(sub)}</span>` : ''}<span class="mod" style="margin-left:auto">${funcs.length} ${funcs.length === 1 ? 'función' : 'funciones'}</span></summary><div class="mod">${esc(mod)}</div>${doc ? `<p>${esc(doc)}</p>` : ''}<div class="met">${funcs.map(f => `<button data-fn="${esc(clave)}|${esc(f.nombre)}">${esc(f.nombre)}()</button>`).join('')}</div></details>`;
  const indice = {};
  CAPAS.forEach(([nom, rutas, desc], i) => {
    const pref = rutas.split('|');
    const mods = cachePoo.filter(m => pref.some(p => m.modulo.startsWith(p)) && !m.modulo.endsWith('portal.py'));
    let html = '';
    for (const m of mods) {
      for (const k of m.clases) { const key = `${m.modulo}#${k.nombre}`; indice[key] = { d: k.detalle, tit: k.nombre, mod: m.modulo }; html += tarjeta(k.nombre, k.bases.length ? `(${k.bases.join(', ')})` : '', `${m.modulo} · línea ${k.linea}`, k.doc, k.detalle, key); }
      if (m.funciones_detalle?.length && !m.clases.length) { const key = `${m.modulo}#`; indice[key] = { d: m.funciones_detalle, tit: m.modulo.split('/').pop(), mod: m.modulo }; html += tarjeta(m.modulo.split('/').pop(), '', m.modulo, m.doc, m.funciones_detalle, key); }
    }
    cont.append(h(`<div class="capa"><div class="nom">${esc(nom)}<small>${esc(rutas.replace(/\|/g, ' · '))}</small><small style="font-family:var(--f-txt);font-size:12px;line-height:1.45;margin-top:4px">${esc(desc)}</small></div><div class="clases">${html}</div></div>`));
    if (i < CAPAS.length - 1) cont.append(h('<div class="flecha-capa"><i data-lucide="chevrons-down" class="i"></i></div>'));
  });
  cont.addEventListener('click', e => {
    const b = e.target.closest('[data-fn]'); if (!b) return;
    const [key, fn] = b.dataset.fn.split('|'); const x = indice[key]; const d = x?.d.find(f => f.nombre === fn); if (!d) return;
    verFuncion(`${x.tit}.${d.nombre}()`, `· ${x.mod} · línea ${d.linea}`, d);
  });
  el.append(cont); iconos();
  if (movimiento) gsap.from($$('.capa', cont), { opacity: 0, y: 12, duration: .4, stagger: .06, clearProps: 'all' });
}

/* ----- SP ----- */
async function renderSP(el) {
  const cab = h(`<div class="seccion-cab"><p class="muted" style="margin:0;font-size:13.5px">Leído de information_schema en Amazon RDS. "Ejecuciones" cuenta las llamadas reales desde que arrancó la API.</p><div class="consola-acciones"><button class="btn sec chico" id="sp-probar"><i data-lucide="play" class="i"></i>Probar consultas</button><button class="btn sec chico" id="sp-recargar"><i data-lucide="rotate-cw" class="i"></i>Actualizar</button></div></div>`);
  const tabla = h('<div class="tabla-wrap"><div class="vacio">Cargando procedimientos…</div></div>');
  el.append(cab, tabla); iconos();
  let previos = {};
  const cargar = async () => {
    const r = await pedir('/portal/api/sp', { timeout: 20000 });
    if (!r.ok) { tabla.innerHTML = `<div class="vacio">No se pudo leer RDS (${r.status})</div>`; return; }
    const max = Math.max(1, ...r.json.procedimientos.map(p => p.llamadas));
    const orden = ['Vehículos', 'Comandos', 'Estado', 'Historial', 'DEMO', 'Movimientos DEMO', 'Otro'];
    const ps = [...r.json.procedimientos].sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo));
    tabla.innerHTML = `<table class="t"><thead><tr><th>Grupo</th><th>Procedimiento</th><th>Parámetros</th><th>Endpoint</th><th>Ejecuciones</th></tr></thead><tbody>${ps.map(p => { const sube = previos[p.sp] !== undefined && p.llamadas > previos[p.sp]; return `<tr><td><span class="chip">${esc(p.grupo)}</span></td><td class="mono"><b>${esc(p.sp)}</b></td><td class="mono muted">${esc(p.parametros.join(', ') || '—')}</td><td class="mono">${esc(p.endpoint)}</td><td><div style="display:flex;align-items:center;gap:10px"><span class="mono" style="width:34px;text-align:right">${p.llamadas}</span><div class="barra-uso" style="flex:1"><i style="width:${(p.llamadas / max) * 100}%"></i></div>${sube ? `<span class="chip ok">+${p.llamadas - previos[p.sp]}</span>` : ''}</div></td></tr>`; }).join('')}</tbody></table>`;
    previos = Object.fromEntries(ps.map(p => [p.sp, p.llamadas]));
    if (movimiento) gsap.from($$('.barra-uso i', tabla), { scaleX: 0, transformOrigin: 'left', duration: .6, stagger: .015, ease: 'power2.out', clearProps: 'transform' });
  };
  $('#sp-recargar', cab).onclick = cargar;
  $('#sp-probar', cab).onclick = async () => {
    const b = $('#sp-probar', cab); b.disabled = true;
    const d = (await pedir('/vehiculos/1/demos')).json?.[0]?.id_demo || 1;
    await Promise.all(['/vehiculos', '/vehiculos/1', '/vehiculos/1/detalle', '/vehiculos/1/comandos', '/vehiculos/1/estado', '/vehiculos/1/historial', `/vehiculos/1/demos/${d}/movimientos`].map(r => pedir(r)));
    b.disabled = false; toast('Consultas ejecutadas: mira los +N'); cargar();
  };
  cargar();
}

/* ----- Laboratorio WebSocket guiado ----- */
function renderLab(el) {
  const PASOS = [
    ['con', 'Conectar A y B', 'Abre dos clientes WSS al vehículo. Ambos deben recibir estado_actual.', 'plug-zap', 'Conectar'],
    ['post', 'Enviar un movimiento', 'POST /movimientos: el evento movimiento debe llegar a A y a B.', 'send', 'Enviar'],
    ['demo', 'Iniciar la DEMO', 'Llegan demo_inicio, los N demo_movimiento con sus tiempos y demo_fin.', 'play', 'Iniciar'],
    ['d409', 'Segunda DEMO a la vez', 'Se inicia una DEMO y enseguida otra: la segunda debe responder 409.', 'copy-x', 'Probar 409'],
    ['cancel', 'Cancelar la DEMO', 'Con una DEMO corriendo, cancelarla publica demo_cancelada.', 'square', 'Cancelar'],
    ['recon', 'Reconectar B', 'B se desconecta y vuelve: debe recibir de nuevo el último estado.', 'refresh-cw', 'Reconectar'],
  ];
  el.append(h(`<div class="intro"><div class="intro-cab"><b><i data-lucide="compass" class="i" style="vertical-align:-3px;margin-right:6px"></i>Laboratorio guiado · sigue los pasos en orden</b>
    <div class="campo" style="width:140px;height:32px"><label for="lab-v">Vehículo</label><input id="lab-v" type="number" min="1" value="1"></div></div>
    <ol id="lab-pasos">${PASOS.map(([id, t, p, ic, corto], i) => `<li data-paso="${id}"><span class="n">${i + 1}</span><div><b>${esc(t)}</b>${esc(p)}<div style="margin-top:8px"><button class="btn chico ${i === 0 ? 'pri pulso' : 'sec'}" data-accion="${id}" ${i === 0 ? '' : 'disabled'}><i data-lucide="${ic}" class="i"></i>${esc(corto)}</button></div><div class="det mono" data-res="${id}" style="margin-top:6px;font-size:11.5px"></div></div></li>`).join('')}</ol></div>`));
  el.append(h(`<div class="lab">${['A', 'B'].map(x => `<div class="tarjeta cliente"><div class="cliente-cab"><span class="punto" id="lab-p${x}"></span><b>Cliente ${x}</b><span class="url" id="lab-u${x}">desconectado</span></div><div class="eventos" id="lab-e${x}"><div class="vacio">Pulsa "Conectar A y B"</div></div></div>`).join('')}</div>`));
  const ws = {}, rec = { A: [], B: [] };
  const idV = () => +$('#lab-v', el).value || 1;
  const res = (id, t, ok) => { const r = $(`[data-res="${id}"]`, el); r.textContent = t; r.style.color = ok === false ? 'var(--mal)' : ok ? 'var(--ok)' : ''; };
  const listo = id => {
    const li = $(`[data-paso="${id}"]`, el); li.classList.add('listo'); li.classList.remove('activo');
    $('.n', li).innerHTML = '<i data-lucide="check" class="i" style="width:13px;height:13px"></i>';
    const i = PASOS.findIndex(p => p[0] === id), sig = PASOS[i + 1];
    $$('[data-accion]', el).forEach(b => b.classList.remove('pulso', 'pri'));
    $$('[data-accion]', el).forEach(b => { if (b.dataset.accion !== 'con') b.disabled = !ws.A; b.classList.add('sec'); });
    if (sig) { const b = $(`[data-accion="${sig[0]}"]`, el); b.classList.remove('sec'); b.classList.add('pri', 'pulso'); $(`[data-paso="${sig[0]}"]`, el).classList.add('activo'); }
    iconos();
  };
  $(`[data-paso="con"]`, el).classList.add('activo');
  function pintarEv(x, m) {
    const caja = $(`#lab-e${x}`, el); if (caja.querySelector('.vacio')) caja.innerHTML = '';
    const d = { estado_actual: `último estado: ${m.comando} · clientes ${m.clientes ?? ''}`, movimiento: `${m.comando} · ${m.origen}`, demo_inicio: `"${m.demo}" · ${m.total_movimientos} movimientos`, demo_movimiento: `${m.numero}/${m.total_movimientos} ${m.comando} · ${m.duracion_ms}+${m.pausa_ms} ms`, demo_fin: `enviados ${m.movimientos_enviados} · historial sin cambios`, demo_cancelada: `enviados ${m.movimientos_enviados}` }[m.evento] ?? (m.detalle || '');
    const fila = h(`<div class="ev ${esc(m.evento)}" title="${esc(JSON.stringify(limpio(m)))}"><span class="h">${hora()}</span><span class="e">${esc(m.evento)}</span><span class="d">${esc(d)}</span></div>`);
    caja.prepend(fila); if (movimiento) gsap.from(fila, { opacity: 0, y: -6, duration: .25 });
  }
  function evaluar(x, m) {
    rec[x].push(m.evento);
    if (m.evento === 'movimiento' && rec.A.includes('movimiento') && rec.B.includes('movimiento')) { res('post', `A y B recibieron ${m.comando} (${m.origen})`, true); listo('post'); }
    if (m.evento === 'demo_fin' && x === 'A') { res('demo', `${m.movimientos_enviados} pasos completos · ${m.historial}`, true); listo('demo'); }
    if (m.evento === 'demo_cancelada' && x === 'A') { res('cancel', `cancelada después de ${m.movimientos_enviados} pasos`, true); listo('cancel'); }
  }
  async function conectar(x) {
    ws[x]?.close(); $(`#lab-u${x}`, el).textContent = 'conectando…';
    ws[x] = await abrirWS(idV(), m => { pintarEv(x, m); evaluar(x, m); });
    $(`#lab-p${x}`, el).className = 'punto ok'; $(`#lab-u${x}`, el).textContent = `${WSB}/ws/vehiculos/${idV()}`;
    ws[x].onclose = () => { $(`#lab-p${x}`, el).className = 'punto'; $(`#lab-u${x}`, el).textContent = 'desconectado'; };
    return ws[x].esperar('estado_actual');
  }
  const sinClave = id => { if (clave()) return false; abrirModal(); res(id, 'Guarda la X-API-Key con el botón Clave de arriba', false); return true; };
  const idDemo = async () => (await pedir(`/vehiculos/${idV()}/demos`)).json?.[0]?.id_demo;
  const acciones = {
    async con() { rec.A = []; rec.B = []; const [a, b] = await Promise.all([conectar('A'), conectar('B')]); res('con', `A: ${a.comando} · B: ${b.comando} · clientes ${b.clientes ?? 2}`, true); listo('con'); },
    async post() { if (sinClave('post')) return; const r = await pedir(`/vehiculos/${idV()}/movimientos`, { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL-LAB' }, conClave: true }); res('post', `POST ${r.status} · clientes_notificados ${r.json?.clientes_notificados ?? r.json?.detail}`, r.ok ? undefined : false); },
    async demo() { if (sinClave('demo')) return; const d = await idDemo(); if (!d) return res('demo', 'Este vehículo no tiene DEMO', false); const r = await pedir(`/vehiculos/${idV()}/demos/${d}/iniciar`, { metodo: 'POST', conClave: true }); res('demo', `POST iniciar ${r.status} · ${r.json?.mensaje || r.json?.detail || ''} · esperando eventos…`, r.ok ? undefined : false); },
    async d409() { if (sinClave('d409')) return; const d = await idDemo(); if (!d) return; const r1 = await pedir(`/vehiculos/${idV()}/demos/${d}/iniciar`, { metodo: 'POST', conClave: true }); await dormir(300); const r2 = await pedir(`/vehiculos/${idV()}/demos/${d}/iniciar`, { metodo: 'POST', conClave: true }); res('d409', `Primera ${r1.status} · segunda ${r2.status} · ${r2.json?.detail || ''}`, r2.status === 409); if (r2.status === 409) listo('d409'); },
    async cancel() { if (sinClave('cancel')) return; const r = await pedir(`/vehiculos/${idV()}/demos/cancelar`, { metodo: 'POST', conClave: true }); res('cancel', `POST cancelar ${r.status} · ${r.json?.mensaje || r.json?.detail || ''}${r.ok ? ' · esperando demo_cancelada…' : ''}`, r.ok ? undefined : false); },
    async recon() { ws.B?.close(); await dormir(500); const e = await conectar('B'); res('recon', `B volvió a recibir estado_actual: ${e.comando}`, true); listo('recon'); },
  };
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-accion]'); if (!b) return;
    b.disabled = true; try { await acciones[b.dataset.accion](); } catch (err) { res(b.dataset.accion, err.message, false); } finally { b.disabled = false; }
  });
  iconos();
}

/* ----- Thunder Client y Postman ----- */
function renderThunder(el) {
  el.append(h(`<div class="seccion-cab"><p class="muted" style="margin:0;font-size:13.5px">La colección usa las variables <code>base</code> y <code>apikey</code>. Thunder Client la importa en Collections → menú ≡ → Import (formato Postman v2.1).</p><button class="btn pri" id="th-desc"><i data-lucide="download" class="i"></i>Descargar colección</button></div>`));
  const tarjeta = (titulo, herramienta, pasos, espera) => h(`<div class="tarjeta p" style="margin-bottom:12px"><span class="donde"><i data-lucide="map-pin" class="i" style="width:12px;height:12px"></i>${esc(herramienta)}</span><h3 class="t" style="margin:4px 0 6px">${esc(titulo)}</h3>${pasos}<div class="espera"><i data-lucide="circle-check" class="i" style="width:14px;height:14px"></i><span><b style="color:inherit">Debe verse:</b> ${esc(espera)}</span></div></div>`);
  el.append(tarjeta('Paso 0 · Abre dos clientes WebSocket', 'VS Code → Postman → New → WebSocket (dos pestañas)', `<p class="muted" style="margin:0;font-size:13.5px">Thunder Client gratuito no abre WebSocket; Postman sí y vive en el mismo VS Code. Pega la URL en cada pestaña y pulsa Connect.</p>${bloque('URL WebSocket', `${WSB}/ws/vehiculos/1`)}`, 'estado_actual en las dos pestañas; en la segunda "clientes": 2.'));
  el.append(tarjeta('Escenario 1 · POST movimiento + WSS', 'Thunder Client → New Request → método POST', `${bloque('URL', `${API}/vehiculos/1/movimientos`)}${bloque('Pestaña Headers → nuevo header', 'X-API-Key')}<p class="muted" style="margin:6px 0 0;font-size:13px">En el valor del header pon tu clave.</p>${bloque('Pestaña Body → JSON', '{"id_comando": 1, "origen": "THUNDER-CLIENT"}')}`, '200 OK · "Movimiento registrado" · "clientes_notificados": 2 · evento movimiento en las dos pestañas de Postman.'));
  el.append(tarjeta('Escenario 2 · GET historial', 'Thunder Client → New Request → método GET', bloque('URL', `${API}/vehiculos/1/historial`), 'limite 10 · total_devueltos ≤ 10 · id_historial del mayor al menor · el movimiento del escenario 1 aparece primero · sin movimientos de DEMO.'));
  el.append(tarjeta('Escenario 3 · DEMO por WSS sin historial', 'Thunder Client → POST (mismo header X-API-Key, sin body)', `${bloque('URL', `${API}/vehiculos/1/demos/1/iniciar`)}<p class="muted" style="margin:6px 0 0;font-size:13px">Al terminar, repite el GET del escenario 2 y haz este GET:</p>${bloque('URL', `${API}/vehiculos/1/estado`)}`, '202 Accepted · en Postman demo_inicio, N demo_movimiento y demo_fin · historial igual que antes · estado = último paso de la DEMO.'));
  el.append(tarjeta('Extra · Ping y reconexión', 'Postman → pestaña WebSocket', `<p class="muted" style="margin:0;font-size:13.5px">Escribe en Message y pulsa Send. Luego pulsa Disconnect y Connect.</p>${bloque('Message', 'ping')}`, 'pong como respuesta y, al reconectar, de nuevo estado_actual.'));
  $('#th-desc', el).onclick = () => {
    const req = (nombre, metodo, ruta, body, conClave) => ({ name: nombre, request: { method: metodo, header: conClave ? [{ key: 'X-API-Key', value: '{{apikey}}' }] : [], url: { raw: `{{base}}${ruta}`, host: ['{{base}}'], path: ruta.split('/').filter(Boolean) }, ...(body ? { body: { mode: 'raw', raw: body, options: { raw: { language: 'json' } } } } : {}) } });
    const col = { info: { name: 'Vehículo IoT · Examen 2.6', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, variable: [{ key: 'base', value: API }, { key: 'apikey', value: '' }],
      item: [req('1 · POST movimiento', 'POST', '/vehiculos/1/movimientos', '{"id_comando": 1, "origen": "THUNDER-CLIENT"}', true), req('2 · GET historial', 'GET', '/vehiculos/1/historial'), req('3 · POST iniciar DEMO', 'POST', '/vehiculos/1/demos/1/iniciar', null, true), req('GET estado', 'GET', '/vehiculos/1/estado'), req('POST cancelar DEMO', 'POST', '/vehiculos/1/demos/cancelar', null, true)] };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(col, null, 2)], { type: 'application/json' })); a.download = 'vehiculo-iot-examen-2.6.postman_collection.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  iconos();
}

/* ----- GitHub ----- */
async function renderGithub(el) {
  el.append(h(`<div class="seccion-cab"><a class="btn sec" href="https://github.com/${REPO}" target="_blank" rel="noopener"><i data-lucide="github" class="i"></i>github.com/${REPO}</a></div>`));
  const lista = h('<div class="tabla-wrap"><div class="vacio">Consultando GitHub…</div></div>'); el.append(lista); iconos();
  const r = await pedir(`https://api.github.com/repos/${REPO}/commits?per_page=30`);
  if (!r.ok) { lista.innerHTML = `<div class="vacio">GitHub no respondió (${r.status})</div>`; return; }
  lista.innerHTML = `<table class="t"><thead><tr><th>Commit</th><th>Mensaje</th><th>Fecha</th></tr></thead><tbody>${r.json.map(c => `<tr><td class="mono"><a href="${esc(c.html_url)}" target="_blank" rel="noopener">${esc(c.sha.slice(0, 7))}</a></td><td>${esc(c.commit.message.split('\n')[0])}</td><td class="mono muted" style="white-space:nowrap">${esc(new Date(c.commit.author.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }))}</td></tr>`).join('')}</tbody></table>`;
}

/* ======================= Barra superior ======================= */
function pintarClave() { const b = $('#pil-clave'); const t = !!clave(); b.innerHTML = `<i data-lucide="${t ? 'key-round' : 'key'}" class="i" style="width:14px;height:14px;color:${t ? 'var(--ok)' : 'inherit'}"></i><span>${t ? 'Clave guardada' : 'Sin clave'}</span>`; iconos(); }
function abrirModal() { $('#modal-clave').hidden = false; $('#mc-valor').value = ''; setTimeout(() => $('#mc-valor').focus(), 30); }
function cerrarModal() { $('#modal-clave').hidden = true; }
$('#pil-clave').onclick = abrirModal;
$('#mc-guardar').onclick = () => { const v = $('#mc-valor').value.trim(); if (v) { ponerClave(v); toast('Clave guardada en este navegador'); } cerrarModal(); };
$('#mc-borrar').onclick = () => { ponerClave(''); toast('Clave eliminada'); cerrarModal(); };
$('#modal-clave').addEventListener('click', e => { if (e.target.id === 'modal-clave') cerrarModal(); });
$('#mc-valor').addEventListener('keydown', e => { if (e.key === 'Enter') $('#mc-guardar').click(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { cerrarModal(); $('#modal-codigo').hidden = true; $('#lado').classList.remove('abierto'); const x = $('.enfoque'); if (x) ampliar(x); } });
$('#tema').onclick = () => { const a = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const n = a === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; try { localStorage.setItem('portal.tema', n); } catch {} };
$('#abrir-menu').onclick = () => $('#lado').classList.toggle('abierto');
$('#pil-api').onclick = () => { location.hash = '#/inicio'; };
async function latido() { const r = await pedir('/', { timeout: 6000 }); $('#pil-api').innerHTML = `<span class="punto ${r.ok ? 'ok' : 'mal'}"></span><span>${r.ok ? `API · ${r.ms} ms` : 'API sin respuesta'}</span>`; }

/* ======================= Arranque ======================= */
pintarNav(); pintarClave(); iconos();
window.addEventListener('hashchange', navegar);
navegar(); latido(); setInterval(latido, 30000);
})();
