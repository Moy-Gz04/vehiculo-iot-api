/* Portal API Vehículo IoT: rutas, comprobaciones en vivo y guía del examen 2.6 */
(() => {
'use strict';

/* ======================= Utilidades ======================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const API = location.origin;
const WSB = API.replace(/^http/, 'ws');
const REPO = 'Moy-Gz04/vehiculo-iot-api';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const iconos = (raiz = document) => window.lucide && lucide.createIcons({ attrs: { class: 'i' }, nameAttr: 'data-lucide', root: raiz });
const dormir = ms => new Promise(r => setTimeout(r, ms));
const movimiento = !matchMedia('(prefers-reduced-motion: reduce)').matches && window.gsap;
const hora = () => new Date().toLocaleTimeString('es-MX', { hour12: false });

function clave() { try { return localStorage.getItem('ctl.apikey') || ''; } catch { return ''; } }
function ponerClave(v) { try { v ? localStorage.setItem('ctl.apikey', v) : localStorage.removeItem('ctl.apikey'); } catch {} pintarClave(); }

async function pedir(ruta, { metodo = 'GET', cuerpo, conClave = false, claveFija, timeout = 12000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  const headers = { Accept: 'application/json' };
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  if (claveFija !== undefined) headers['X-API-Key'] = claveFija; else if (conClave && clave()) headers['X-API-Key'] = clave();
  const t0 = performance.now();
  try {
    const r = await fetch(ruta.startsWith('http') ? ruta : API + ruta, { method: metodo, headers, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined, signal: ctl.signal });
    const txt = await r.text(); let json = null; try { json = JSON.parse(txt); } catch {}
    return { status: r.status, ok: r.ok, json, txt, ms: Math.round(performance.now() - t0) };
  } catch (e) { return { status: 0, ok: false, json: null, txt: '', ms: Math.round(performance.now() - t0), error: e.name }; }
  finally { clearTimeout(t); }
}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('ver'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('ver'), 2200); }
async function copiar(txt) { try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { toast('No se pudo copiar'); } }

/* Cliente WebSocket con promesas para las pruebas */
function abrirWS(idV, alMensaje) {
  return new Promise((ok, mal) => {
    const ws = new WebSocket(`${WSB}/ws/vehiculos/${idV}`);
    const espera = []; ws.recibidos = [];
    ws.esperar = (evento, ms = 6000) => new Promise((res, rej) => {
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

/* ======================= Estado global ======================= */
const resultados = {};      // id criterio -> 'ok' | 'mal' | 'av'
const detalles = {};        // id criterio -> checks
let cacheSistema = null, cacheCodigo = null, cachePoo = null;

/* ======================= Criterios del examen ======================= */
const C = [
{
  id: 'python', tec: 'Python', titulo: 'Código funcional y dependencias', pts: 5, icono: 'file-code-2',
  revisa: ['El proyecto corre en Python', 'Dependencias fijadas en requirements.txt', 'Código organizado por módulos'],
  intro: 'La API está escrita en Python y sus dependencias están fijadas con versión exacta en requirements.txt. Aquí se puede recorrer el código real que ejecuta el servidor, archivo por archivo.',
  extra: { tab: 'Código', icono: 'folder-tree', render: renderCodigo },
  async verificar() {
    const s = await pedir('/portal/api/sistema'); const c = [];
    if (!s.ok) return [{ t: 'Servidor de la API', ok: false, det: `No respondió (${s.status || s.error})` }];
    cacheSistema = s.json;
    c.push({ t: `Python ${s.json.python} en ejecución`, ok: true, det: `${s.json.implementacion} · ${s.json.sistema} · servidor ${s.json.servidor}` });
    const deps = s.json.dependencias;
    const bien = deps.filter(d => d.instalada === d.requerida);
    c.push({ t: `${bien.length} de ${deps.length} dependencias instaladas con la versión de requirements.txt`, ok: bien.length === deps.length, det: deps.map(d => `${d.paquete}==${d.instalada}`).join(' · ') });
    const cod = await pedir('/portal/api/codigo');
    if (cod.ok) { cacheCodigo = cod.json; const py = cod.json.filter(f => f.ruta.endsWith('.py')); c.push({ t: `${py.length} módulos Python cargados por el servidor`, ok: py.length >= 10, det: `${py.reduce((a, f) => a + f.lineas, 0).toLocaleString('es-MX')} líneas · el .env nunca se expone` }); }
    return c;
  },
  pasos: [
    ['Abre la pestaña Código', 'Muestra el árbol: app/ con db, repositorios, servicios, rutas, modelos y tiempo_real, más requirements.txt.'],
    ['Enseña requirements.txt', 'Cada paquete tiene versión exacta (fastapi, pydantic, PyMySQL, uvicorn, websockets, python-dotenv, cryptography).'],
    ['Pulsa Verificar', 'La comprobación compara las versiones instaladas en el servidor contra requirements.txt y confirma que la API está corriendo.'],
    ['Explica cómo se ejecuta', 'En EC2 corre con uvicorn como tarea programada; en local: python -m venv .venv, pip install -r requirements.txt y uvicorn app.main:app.'],
  ],
},
{
  id: 'fastapi', tec: 'FastAPI', titulo: 'GET/POST, respuestas y validaciones', pts: 10, icono: 'braces',
  revisa: ['Servicios GET y POST', 'Códigos de respuesta correctos', 'Validación de entradas y errores'],
  intro: 'FastAPI expone los servicios GET (consultas) y POST (acciones) y valida cada petición con modelos Pydantic. La comprobación provoca a propósito cada tipo de respuesta para demostrar que la API contesta con el código correcto.',
  async verificar() {
    const c = [];
    let r = await pedir('/vehiculos');
    c.push({ t: 'GET /vehiculos → 200 con la lista', ok: r.status === 200 && Array.isArray(r.json), det: `${r.status} · ${Array.isArray(r.json) ? r.json.length + ' vehículos' : ''} · ${r.ms} ms` });
    r = await pedir('/vehiculos/999999');
    c.push({ t: 'GET de un vehículo inexistente → 404', ok: r.status === 404, det: `${r.status} · ${r.json?.detail ?? ''}` });
    r = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL' } });
    c.push({ t: 'POST sin X-API-Key → 401', ok: r.status === 401, det: `${r.status} · ${r.json?.detail ?? ''}` });
    r = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL' }, claveFija: 'clave-incorrecta' });
    c.push({ t: 'POST con clave incorrecta → 403', ok: r.status === 403, det: `${r.status} · ${r.json?.detail ?? ''}` });
    if (clave()) {
      r = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 'texto' }, conClave: true });
      c.push({ t: 'POST con body inválido → 422 (validación Pydantic)', ok: r.status === 422, det: `${r.status} · el tipo de id_comando no es entero` });
    } else c.push({ t: 'POST con body inválido → 422', ok: null, det: 'Guarda la clave (botón de la barra superior) para ejecutar esta prueba' });
    r = await pedir('/openapi.json');
    const rutas = r.json ? Object.values(r.json.paths).reduce((a, p) => a + Object.keys(p).length, 0) : 0;
    c.push({ t: `${rutas} operaciones documentadas en OpenAPI`, ok: rutas >= 20, det: `GET y POST · ${r.ms} ms` });
    return c;
  },
  pasos: [
    ['Pulsa Verificar frente al profe', 'Se ejecutan en vivo un 200, un 404, un 401, un 403 y un 422 contra la API pública.'],
    ['Explica GET contra POST', 'GET solo consulta (vehículos, comandos, estado, historial, DEMO). POST ejecuta acciones: movimientos, crear, actualizar, eliminar, iniciar DEMO.'],
    ['Muestra una validación', 'En Swagger manda un POST con id_comando como texto: FastAPI responde 422 antes de tocar la base de datos.'],
    ['Menciona los códigos', '200, 201, 202 (DEMO en segundo plano), 400, 401, 403, 404, 409 (DEMO duplicada), 422, 500 y 503 (RDS no disponible).'],
  ],
},
{
  id: 'poo', tec: 'Programación Orientada a Objetos', titulo: 'Clases, módulos y separación de responsabilidades', pts: 10, icono: 'boxes',
  revisa: ['Clases con una sola responsabilidad', 'Módulos separados por capa', 'Las rutas no acceden directo a la base'],
  intro: 'La API está organizada en capas. Cada clase tiene una sola responsabilidad: las rutas reciben y responden, los servicios aplican reglas de negocio, el repositorio ejecuta los SP y BaseDatos maneja la conexión. El diagrama se genera leyendo el código real del servidor.',
  extra: { tab: 'Arquitectura', icono: 'network', render: renderPoo },
  async verificar() {
    const r = await pedir('/portal/api/poo'); if (!r.ok) return [{ t: 'Análisis del código', ok: false, det: String(r.status) }];
    cachePoo = r.json; const c = [];
    const clases = r.json.flatMap(m => m.clases.map(k => k.nombre));
    c.push({ t: `${clases.length} clases en ${r.json.length} módulos`, ok: clases.length >= 10, det: clases.slice(0, 14).join(' · ') + (clases.length > 14 ? ' …' : '') });
    const claves = ['Configuracion', 'BaseDatos', 'Sesion', 'RepositorioSP', 'ServicioMovimientos', 'EjecutorDemos', 'GestorWebSocket'];
    const faltan = claves.filter(k => !clases.includes(k));
    c.push({ t: 'Existen las capas: configuración, conexión, repositorio, servicios y WebSocket', ok: !faltan.length, det: faltan.length ? 'Faltan: ' + faltan.join(', ') : claves.join(' → ') });
    const rutasDirectas = r.json.filter(m => m.modulo.startsWith('app/rutas/') && !m.modulo.endsWith('portal.py') && (m.importa.includes('db') || m.importa.includes('repositorios')));
    c.push({ t: 'Las rutas no importan la base de datos ni el repositorio', ok: !rutasDirectas.length, det: rutasDirectas.length ? rutasDirectas.map(m => m.modulo).join(', ') : 'Las rutas solo usan servicios (inyectados por el Contenedor)' });
    const repo = r.json.flatMap(m => m.clases).find(k => k.nombre === 'RepositorioSP');
    c.push({ t: `RepositorioSP con ${repo ? repo.metodos.filter(x => x !== '__init__').length : 0} métodos, uno por SP`, ok: !!repo && repo.metodos.length >= 21, det: 'Sin reglas de negocio: solo llama al procedimiento con sus parámetros' });
    return c;
  },
  pasos: [
    ['Abre la pestaña Arquitectura', 'Recorre las capas de arriba a abajo: Rutas → Servicios → Repositorio → BaseDatos → Amazon RDS.'],
    ['Explica por qué POO', 'Cada clase cambia por un solo motivo. Pasar de MySQL local a RDS solo requirió cambiar el .env, sin tocar servicios ni rutas.'],
    ['Señala el Contenedor', 'dependencias.py crea una sola vez el repositorio, los servicios y el ejecutor de DEMO y los comparte (inyección de dependencias).'],
    ['Muestra un flujo', 'POST movimiento: la ruta valida con Pydantic → ServicioMovimientos revisa reglas → RepositorioSP ejecuta 2 SP en una transacción → GestorWebSocket notifica.'],
  ],
},
{
  id: 'rds', tec: 'Amazon RDS', titulo: 'Conexión remota segura y persistencia', pts: 10, icono: 'database',
  revisa: ['La API usa Amazon RDS', 'RDS no está abierto a Internet', 'Los datos persisten'],
  intro: 'La base vehiculo_iot vive en Amazon RDS for MySQL. El servidor EC2 se conecta por la red privada de AWS y RDS solo acepta conexiones desde el grupo de seguridad del EC2. La comprobación consulta RDS en vivo y cuenta los registros de cada tabla.',
  async verificar() {
    const r = await pedir('/portal/api/rds', { timeout: 20000 });
    if (!r.ok || !r.json?.conectado) return [{ t: 'Conexión con la base de datos', ok: false, det: r.json?.error || String(r.status) }];
    const d = r.json, c = [];
    c.push({ t: d.es_rds ? `Conectado a Amazon RDS (${d.region})` : 'Conectado a MySQL (no es RDS)', ok: d.es_rds, det: `${d.host} · base ${d.base}` });
    c.push({ t: d.ip_privada ? 'La conexión va por IP privada dentro de AWS' : 'El endpoint se resuelve a una IP pública', ok: d.ip_privada === true, det: 'El grupo de seguridad de RDS solo permite 3306 desde el EC2' });
    c.push({ t: `MySQL ${d.version} respondió en ${d.latencia_ms} ms`, ok: true, det: `${d.edicion} · hora del servidor ${d.hora_servidor}` });
    const total = d.tablas.reduce((a, t) => a + t.filas, 0);
    c.push({ t: `${d.tablas.length} tablas con ${total.toLocaleString('es-MX')} registros persistidos`, ok: d.tablas.length >= 6, det: d.tablas.map(t => `${t.tabla} ${t.filas}`).join(' · ') });
    return c;
  },
  pasos: [
    ['Pulsa Verificar', 'Se ve el endpoint de RDS (enmascarado), la región, la versión de MySQL, la latencia y los registros de las 6 tablas.'],
    ['Abre la consola de AWS → RDS', 'Muestra instancia-rds-iot en estado Disponible y su endpoint.'],
    ['Muestra el grupo de seguridad rds-iot-sg', 'Regla MySQL 3306 con origen server1-sg: la base no está abierta a Internet.'],
    ['Demuestra persistencia', 'Haz un POST de movimiento, vuelve a verificar y el conteo de historial_comandos aumenta; reinicia la API y el dato sigue ahí.'],
  ],
},
{
  id: 'mysql', tec: 'MySQL', titulo: 'Uso funcional de los 21 Stored Procedures', pts: 10, icono: 'table-2',
  revisa: ['Existen los 21 SP en vehiculo_iot', 'Cada SP lo usa un endpoint', 'Se conservan nombres y parámetros'],
  intro: 'La comprobación lee information_schema de RDS para listar los procedimientos con sus parámetros y muestra cuántas veces la API ha ejecutado cada uno desde que arrancó: es la evidencia de uso real.',
  extra: { tab: 'Procedimientos', icono: 'list-tree', render: renderSP },
  async verificar() {
    const r = await pedir('/portal/api/sp', { timeout: 20000 }); if (!r.ok) return [{ t: 'Lectura de information_schema', ok: false, det: String(r.status) }];
    const d = r.json, c = [];
    c.push({ t: `${d.total} de ${d.esperados} Stored Procedures existen en RDS`, ok: d.total >= d.esperados, det: 'Consultado en information_schema.ROUTINES' });
    const sinMapa = d.procedimientos.filter(p => p.grupo === 'Otro');
    c.push({ t: 'Cada procedimiento está ligado a un endpoint de la API', ok: !sinMapa.length, det: sinMapa.length ? sinMapa.map(p => p.sp).join(', ') : '5 vehículos · 4 comandos · 2 estado · 2 historial · 4 DEMO · 4 movimientos DEMO' });
    const usados = d.procedimientos.filter(p => p.llamadas > 0);
    c.push({ t: `${usados.length} procedimientos ya ejecutados por la API desde su arranque`, ok: usados.length > 0, det: `${d.procedimientos.reduce((a, p) => a + p.llamadas, 0)} llamadas registradas · ejecutados con callproc y parámetros enlazados` });
    return c;
  },
  pasos: [
    ['Abre la pestaña Procedimientos', 'Están los 21 SP agrupados, con sus parámetros, el endpoint que los usa y cuántas veces se han ejecutado.'],
    ['Pulsa Probar consultas', 'Ejecuta los GET de la API y los contadores de los SP de lectura suben en vivo.'],
    ['Haz un movimiento', 'Tras un POST suben sp_actualizar_estado y sp_registrar_historial: se ejecutan juntos en una transacción.'],
    ['Corre una DEMO', 'Sube sp_obtener_movimientos_demo y sp_actualizar_estado, pero no sp_registrar_historial: por eso la DEMO no deja historial.'],
  ],
},
{
  id: 'wss', tec: 'WebSocket (WSS)', titulo: 'Último estado, evento POST, DEMO N pasos y reconexión', pts: 25, icono: 'radio',
  revisa: ['Último estado al conectar', 'Evento tras un POST en varios clientes', 'DEMO con N pasos temporizados', 'Reconexión'],
  intro: 'El WebSocket seguro es el canal que en el futuro moverá al vehículo. La comprobación abre dos clientes WSS reales al mismo vehículo y comprueba cada punto que pide el examen. En el laboratorio se pueden repetir las pruebas frente al profe.',
  extra: { tab: 'Laboratorio', icono: 'flask-conical', render: renderLab },
  async verificar() {
    const c = [];
    c.push({ t: location.protocol === 'https:' ? 'Canal cifrado WSS (wss://)' : 'Canal sin cifrar (ws://, entorno local)', ok: location.protocol === 'https:', det: `${WSB}/ws/vehiculos/{id}` });
    let A, B;
    try {
      [A, B] = await Promise.all([abrirWS(1), abrirWS(1)]);
      const [ea, eb] = await Promise.all([A.esperar('estado_actual'), B.esperar('estado_actual')]);
      c.push({ t: 'Dos clientes reciben el último estado guardado en RDS al conectarse', ok: true, det: `A: ${ea.comando} · B: ${eb.comando} · clientes conectados ${eb.clientes ?? 2}` });
      if (clave()) {
        const pa = A.esperar('movimiento'), pb = B.esperar('movimiento');
        const r = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL' }, conClave: true });
        const [ma, mb] = await Promise.all([pa, pb]);
        c.push({ t: 'Un POST válido llega como evento a los dos clientes', ok: r.ok && !!ma && !!mb, det: `POST ${r.status} · clientes_notificados ${r.json?.clientes_notificados} · ${ma.comando} (${ma.origen})` });
      } else c.push({ t: 'Evento tras un POST', ok: null, det: 'Guarda la clave para enviar el POST de prueba' });
      B.close(); await dormir(400);
      const B2 = await abrirWS(1); const er = await B2.esperar('estado_actual');
      c.push({ t: 'Reconexión: el cliente vuelve a recibir el último estado', ok: true, det: `estado_actual → ${er.comando}` }); B2.close();
      const d = await pedir('/vehiculos/1/demos'); const idD = d.json?.[0]?.id_demo;
      if (idD) { const m = await pedir(`/vehiculos/1/demos/${idD}/movimientos`); c.push({ t: `DEMO lista para transmitir ${m.json?.length ?? 0} pasos temporizados`, ok: (m.json?.length ?? 0) > 0, det: 'Ejecútala en el Laboratorio para ver demo_inicio, los N demo_movimiento y demo_fin' }); }
    } catch (e) { c.push({ t: 'Conexión WebSocket', ok: false, det: e.message }); }
    finally { A?.close(); B?.close(); }
    return c;
  },
  pasos: [
    ['Abre el Laboratorio y conecta los dos clientes', 'Ambos reciben estado_actual con el último comando guardado en RDS.'],
    ['Envía un movimiento', 'Los dos clientes reciben el evento movimiento al mismo tiempo; la respuesta del POST dice clientes_notificados: 2.'],
    ['Inicia la DEMO', 'Llegan demo_inicio, los N demo_movimiento respetando duración y pausa, y demo_fin con historial sin cambios.'],
    ['Inicia otra DEMO mientras corre', 'La API responde 409: no se ejecutan dos DEMO a la vez en el mismo vehículo.'],
    ['Cancela y reconecta', 'Cancelar publica demo_cancelada; al reconectar un cliente vuelve a recibir el último estado.'],
  ],
},
{
  id: 'swagger', tec: 'Swagger UI', titulo: 'Documentación HTTP pública en HTTPS', pts: 5, icono: 'book-open-text',
  revisa: ['Swagger UI disponible públicamente', 'Servido por HTTPS', 'Endpoints con parámetros, respuestas y SP'],
  intro: 'Swagger UI se genera a partir del propio código de FastAPI. Cada operación describe sus parámetros, respuestas, errores y los Stored Procedures que ejecuta.',
  extra: { tab: 'Vista previa', icono: 'monitor', render: el => { el.append(h(`<div class="marco"><div class="marco-cab"><div class="luces"><i></i><i></i><i></i></div><div class="url">${esc(API)}/docs</div><a class="btn chico sec" href="/docs" target="_blank" rel="noopener"><i data-lucide="external-link" class="i"></i>Abrir</a></div><iframe src="/docs" title="Swagger UI" style="height:640px" loading="lazy"></iframe></div>`)); } },
  async verificar() {
    const c = [];
    const d = await pedir('/docs'); c.push({ t: 'Swagger UI responde en /docs', ok: d.status === 200 && /swagger/i.test(d.txt), det: `${d.status} · ${d.ms} ms` });
    c.push({ t: location.protocol === 'https:' ? 'Publicado por HTTPS con certificado válido' : 'Servido por HTTP (entorno local)', ok: location.protocol === 'https:', det: `${API}/docs` });
    const o = await pedir('/openapi.json');
    if (o.json) {
      const ops = Object.values(o.json.paths).flatMap(p => Object.values(p));
      const conSP = ops.filter(op => /sp_/.test(op.description || '')).length;
      c.push({ t: `${ops.length} operaciones · ${conSP} indican los Stored Procedures que usan`, ok: conSP >= 15, det: `${(o.json.tags || []).length} grupos documentados` });
    }
    return c;
  },
  pasos: [
    ['Abre la URL pública', 'Muestra que la barra del navegador tiene candado y la dirección https://…/docs.'],
    ['Recorre los grupos', 'Vehículos, Comandos, Estado, Historial, DEMO, Movimientos DEMO y Ejecución DEMO.'],
    ['Abre una operación', 'Se ven parámetros, modelos JSON, códigos de respuesta y el SP que ejecuta.'],
    ['Autoriza y prueba', 'Botón Authorize con la X-API-Key y Try it out en un GET y un POST.'],
  ],
},
{
  id: 'thunder', tec: 'Thunder Client', titulo: 'Tres escenarios públicos: GET, POST y WSS', pts: 10, icono: 'zap',
  revisa: ['GET historial (máx. 10)', 'POST movimiento con notificación WSS', 'DEMO por WSS sin historial'],
  intro: 'Thunder Client es la herramienta que pide el examen. Aquí están las tres peticiones listas para copiar, la colección para importar y lo que debe verse en cada una. La comprobación ejecuta los mismos escenarios para confirmar que funcionan.',
  extra: { tab: 'Peticiones', icono: 'send', render: renderThunder },
  async verificar() {
    const c = [];
    const r = await pedir('/vehiculos/1/historial'); const m = r.json?.movimientos || [];
    const desc = m.every((x, i) => i === 0 || m[i - 1].id_historial > x.id_historial);
    c.push({ t: 'Escenario GET: historial con máximo 10, del más reciente al más antiguo', ok: r.ok && m.length <= 10 && desc, det: `${r.status} · total_devueltos ${r.json?.total_devueltos} · #${m[0]?.id_historial ?? '—'} … #${m.at(-1)?.id_historial ?? '—'}` });
    const pr = await pedir('/vehiculos/1/movimientos', { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL' } });
    c.push({ t: 'Escenario POST disponible y protegido', ok: pr.status === 401, det: 'Sin clave responde 401; en Thunder Client se agrega el header X-API-Key' });
    const d = await pedir('/vehiculos/1/demos');
    c.push({ t: 'Escenario WSS: DEMO registrada en RDS', ok: (d.json?.length ?? 0) > 0, det: d.json?.[0] ? `DEMO ${d.json[0].id_demo} · ${d.json[0].nombre}` : 'Sin DEMO' });
    c.push({ t: 'Capturas en Thunder Client', ok: null, det: 'Se toman en VS Code siguiendo la pestaña Peticiones' });
    return c;
  },
  pasos: [
    ['Importa la colección', 'Descárgala en la pestaña Peticiones e impórtala en Thunder Client (Collections → Import). Pon la clave en la variable apikey.'],
    ['Escenario 1 · POST', 'Con dos pestañas WSS abiertas en Postman, envía el movimiento: 200 y clientes_notificados: 2.'],
    ['Escenario 2 · GET', 'Historial: limite 10, total_devueltos ≤ 10, del id más alto al más bajo, sin movimientos de DEMO.'],
    ['Escenario 3 · DEMO', 'POST iniciar → 202. En el WSS llegan inicio, N movimientos y fin; el historial no cambia y el estado queda en el último paso.'],
  ],
},
{
  id: 'github', tec: 'Git / GitHub', titulo: 'Control de versiones y despliegue desde repositorio', pts: 5, icono: 'git-branch',
  revisa: ['Repositorio público verificable', 'Historial de commits', 'Sin .env ni contraseñas'],
  intro: 'El código está versionado en GitHub y el servidor se actualiza descargando el repositorio. La comprobación consulta GitHub en vivo.',
  extra: { tab: 'Commits', icono: 'git-commit-horizontal', render: renderGithub },
  async verificar() {
    const c = [];
    const r = await pedir(`https://api.github.com/repos/${REPO}`);
    if (!r.ok) return [{ t: 'Consulta a GitHub', ok: false, det: r.status === 403 ? 'Límite de consultas de GitHub alcanzado; intenta en unos minutos' : String(r.status || r.error) }];
    c.push({ t: `Repositorio ${r.json.full_name} ${r.json.private ? 'privado' : 'público'}`, ok: !r.json.private, det: `rama ${r.json.default_branch} · actualizado ${new Date(r.json.pushed_at).toLocaleString('es-MX')}` });
    const cm = await pedir(`https://api.github.com/repos/${REPO}/commits?per_page=100`);
    c.push({ t: `${cm.json?.length ?? 0} commits en el historial`, ok: (cm.json?.length ?? 0) >= 5, det: cm.json?.[0]?.commit?.message.split('\n')[0] ?? '' });
    const raiz = await pedir(`https://api.github.com/repos/${REPO}/contents/`);
    const nombres = (raiz.json || []).map(f => f.name);
    c.push({ t: 'El repositorio no contiene .env', ok: !nombres.includes('.env') && nombres.includes('.env.example'), det: nombres.join(' · ') });
    const tags = await pedir(`https://api.github.com/repos/${REPO}/tags`);
    c.push({ t: `${tags.json?.length ?? 0} etiqueta(s) de versión`, ok: (tags.json?.length ?? 0) > 0, det: (tags.json || []).map(t => t.name).join(' · ') });
    return c;
  },
  pasos: [
    ['Abre el repositorio', `github.com/${REPO}: código, README con eventos WSS, requirements.txt y deploy/.`],
    ['Muestra el historial', 'Los commits documentan la evolución: API, Swagger, despliegue en EC2, HTTPS y simulador.'],
    ['Muestra .gitignore', 'Excluye .env, .venv y __pycache__; solo se publica .env.example sin secretos.'],
    ['Explica el despliegue', 'El servidor descarga la rama main desde GitHub y reinicia la tarea programada de la API.'],
  ],
},
{
  id: 'ec2', tec: 'Amazon EC2 y publicación', titulo: 'Servidor persistente, dominio y HTTPS/WSS', pts: 10, icono: 'server',
  revisa: ['API en EC2 sin depender de VS Code', 'Dominio fijo', 'HTTPS y WSS'],
  intro: 'La API corre en Amazon EC2 como tarea programada, detrás de Caddy, que publica HTTPS/WSS con certificado de Let\'s Encrypt. La IP elástica mantiene el dominio aunque se reinicie la instancia.',
  async verificar() {
    const c = []; const s = cacheSistema || (await pedir('/portal/api/sistema')).json;
    c.push({ t: location.protocol === 'https:' ? 'Servido por HTTPS con certificado válido' : 'Servido por HTTP', ok: location.protocol === 'https:', det: location.host });
    c.push({ t: /sslip\.io$|amazonaws\.com$/.test(location.hostname) ? 'Dominio público ligado a la IP elástica' : 'Dominio local', ok: /sslip\.io$/.test(location.hostname), det: location.hostname });
    if (s) {
      const hrs = (s.uptime_s / 3600).toFixed(1);
      c.push({ t: `API en línea en ${s.servidor} desde hace ${hrs} h`, ok: true, det: `${s.sistema} · proceso independiente de VS Code (tarea programada)` });
      c.push({ t: 'El proxy entrega la petición original como HTTPS', ok: s.protocolo === 'https', det: `X-Forwarded-Proto: ${s.protocolo}` });
    }
    try { const w = await abrirWS(1); await w.esperar('estado_actual'); w.close(); c.push({ t: 'WSS accesible desde un cliente externo', ok: true, det: `${WSB}/ws/vehiculos/1` }); }
    catch (e) { c.push({ t: 'WSS accesible desde un cliente externo', ok: false, det: e.message }); }
    return c;
  },
  pasos: [
    ['Muestra la instancia', 'EC2 → Instancias: Server1 en ejecución, 3/3 comprobaciones e IP elástica 13.218.5.111.'],
    ['Cierra VS Code', 'Recarga este portal: sigue funcionando porque la API corre como tarea programada en el servidor.'],
    ['Muestra el candado', 'https://13-218-5-111.sslip.io: certificado válido de Let\'s Encrypt emitido por Caddy.'],
    ['Muestra los puertos', 'server1-sg con 443 y 80 (HTTPS y certificado) y 8000; RDS solo desde el EC2.'],
  ],
},
];
C.forEach((c, i) => c.num = i + 1);

/* ======================= Navegación ======================= */
function pintarNav() {
  $('#nav-guia').innerHTML = C.map(c => `<a href="#/guia/${c.id}" data-ruta="guia/${c.id}"><span class="num">${String(c.num).padStart(2, '0')}</span><span>${esc(c.tec)}</span><span class="pts">${c.pts}</span><span class="punto" data-punto="${c.id}"></span></a>`).join('');
}
function marcarNav(ruta) {
  $$('#nav a').forEach(a => a.setAttribute('aria-current', a.dataset.ruta === ruta ? 'page' : 'false'));
  $('#lado').classList.remove('abierto');
}
function pintarPuntos() {
  for (const c of C) { const p = $(`[data-punto="${c.id}"]`); if (p) p.className = 'punto ' + (resultados[c.id] || ''); }
  const ganados = C.filter(c => resultados[c.id] === 'ok').reduce((a, c) => a + c.pts, 0);
  const ring = $('#anillo-valor'); if (ring) { ring.style.strokeDashoffset = 314 * (1 - ganados / 100); $('#anillo-cifra').textContent = ganados; }
  $$('[data-criterio-estado]').forEach(el => { const r = resultados[el.dataset.criterioEstado]; el.className = 'chip ' + ({ ok: 'ok', mal: 'mal', av: 'av' }[r] || ''); el.textContent = { ok: 'Verificado', mal: 'Falla', av: 'Parcial' }[r] || 'Pendiente'; });
}

const RUTAS = { inicio: vInicio, api: vApi, simulador: vSimulador, control: vControl };
let rutaActual = '';
async function navegar() {
  const ruta = (location.hash.replace(/^#\/?/, '') || 'inicio');
  if (ruta === rutaActual) return; rutaActual = ruta;
  const vista = $('#vista');
  if (movimiento && vista.children.length) await gsap.to(vista, { opacity: 0, y: 6, duration: .14, ease: 'power1.in' });
  vista.innerHTML = ''; vista.className = 'vista';
  const [base, id] = ruta.split('/');
  let titulo = 'Inicio';
  if (base === 'guia' && C.find(c => c.id === id)) { const c = C.find(x => x.id === id); vGuia(vista, c); titulo = `${c.num}. ${c.tec}`; }
  else { (RUTAS[base] || vInicio)(vista); titulo = { inicio: 'Inicio', api: 'API Vehículo IoT', simulador: 'Simulador DEMO', control: 'Control real' }[base] || 'Inicio'; }
  $('#miga b').textContent = titulo; document.title = `${titulo} · Portal Vehículo IoT`;
  marcarNav(base === 'guia' ? ruta : (RUTAS[base] ? base : 'inicio'));
  iconos(vista); pintarPuntos();
  window.scrollTo({ top: 0 });
  if (movimiento) {
    gsap.fromTo(vista, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out' });
    gsap.from($$('[data-entra]', vista), { opacity: 0, y: 14, duration: .45, stagger: .045, ease: 'power2.out', delay: .05, clearProps: 'all' });
  }
}

/* ======================= Vistas ======================= */
function vInicio(v) {
  v.append(h(`<section class="hero" data-entra>
    <div class="rejilla"></div>
    <div class="hero-cuerpo">
      <div>
        <span class="eyebrow"><i data-lucide="activity" class="i"></i>2.6 Examen Tema 2 · Arquitectura y tecnologías de IoT</span>
        <h1 class="t">API Vehículo IoT</h1>
        <p class="lead">FastAPI con programación orientada a objetos en Amazon EC2, datos en Amazon RDS con 21 Stored Procedures y un WebSocket seguro que transmite el estado y las DEMO en tiempo real.</p>
        <div class="acciones">
          <button class="btn pri" id="verificar-todo"><i data-lucide="shield-check" class="i"></i>Verificar los 10 criterios</button>
          <a class="btn sec" href="#/guia/python"><i data-lucide="list-checks" class="i"></i>Abrir la guía</a>
        </div>
      </div>
      <div class="puntaje">
        <div class="anillo"><svg viewBox="0 0 120 120"><circle class="fondo" cx="60" cy="60" r="50" fill="none" stroke-width="10"/><circle id="anillo-valor" class="valor" cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-dasharray="314" stroke-dashoffset="314"/></svg>
          <div class="cifra"><div><b id="anillo-cifra">0</b><span>de 100</span></div></div></div>
        <ul id="resumen-criterios"></ul>
      </div>
    </div>
  </section>`));
  const ul = $('#resumen-criterios', v);
  ul.innerHTML = C.slice(0, 10).map(c => `<li><span class="punto" data-punto="${c.id}"></span>${esc(c.tec)}<span class="mono" style="margin-left:auto;color:var(--tenue)">${c.pts}</span></li>`).join('');

  v.append(h(`<div class="seccion estado-vivo" data-entra>
    ${kpi('api', 'activity', 'API', '—', 'comprobando…')}${kpi('rds', 'database', 'Amazon RDS', '—', 'comprobando…')}${kpi('sp', 'table-2', 'Stored Procedures', '—', 'comprobando…')}
    ${kpi('wss', 'radio', 'WebSocket', '—', 'comprobando…')}${kpi('https', 'lock', 'Publicación', '—', 'comprobando…')}
  </div>`));

  v.append(h(`<div class="seccion grid g3" data-entra>
    ${acceso('api', 'braces', 'API Vehículo IoT', 'Swagger UI con las operaciones GET y POST, sus parámetros, respuestas y los SP que usan.')}
    ${acceso('simulador', 'route', 'Simulador DEMO', 'Crea un vehículo con N movimientos, arma su DEMO y mírala en vivo por WebSocket.')}
    ${acceso('control', 'gamepad-2', 'Control real', 'El control remoto del vehículo: RC clásico y Gamepad, conectado al mismo WebSocket.')}
  </div>`));

  const lista = h(`<div class="seccion" data-entra><div class="seccion-cab"><div><span class="eyebrow">Guía del examen</span><h2 class="t">Lo que revisará el profesor</h2></div><span class="muted mono" style="font-size:12px">Cada criterio tiene comprobación en vivo y pasos para demostrarlo</span></div><div class="criterios"></div></div>`);
  $('.criterios', lista).innerHTML = C.map(c => `<a class="criterio" href="#/guia/${c.id}"><span class="n">${String(c.num).padStart(2, '0')}</span><div><b>${esc(c.tec)}</b><small>${esc(c.titulo)}</small></div><div class="d"><span class="chip" data-criterio-estado="${c.id}">Pendiente</span><span class="chip">${c.pts} pts</span></div></a>`).join('');
  v.append(lista);

  $('#verificar-todo', v).addEventListener('click', verificarTodo);
  estadoInicio(v);
}
const kpi = (id, ic, k, val, s) => `<div class="tarjeta kpi" id="kpi-${id}"><div class="k"><i data-lucide="${ic}" class="i" style="width:13px;height:13px"></i>${k}</div><div class="v">${val}</div><div class="s">${s}</div></div>`;
const acceso = (ruta, ic, t, p) => `<a class="tarjeta acceso" href="#/${ruta}"><span class="ic"><i data-lucide="${ic}" class="i"></i></span><h3 class="t">${t}</h3><p>${p}</p><span class="ir">Abrir <i data-lucide="arrow-right" class="i" style="width:14px;height:14px"></i></span></a>`;
function ponKpi(id, v, s, estado) { const el = $(`#kpi-${id}`); if (!el) return; $('.v', el).textContent = v; $('.s', el).textContent = s; $('.v', el).style.color = estado === 'mal' ? 'var(--mal)' : ''; }

async function estadoInicio() {
  pedir('/').then(r => ponKpi('api', r.ok ? 'En línea' : 'Sin respuesta', r.ok ? `GET / · ${r.ms} ms` : String(r.status), r.ok ? 'ok' : 'mal'));
  pedir('/portal/api/rds', { timeout: 20000 }).then(r => r.json?.conectado ? ponKpi('rds', `${r.json.latencia_ms} ms`, `MySQL ${r.json.version} · ${r.json.region || 'local'}`) : ponKpi('rds', 'Sin conexión', r.json?.error || '', 'mal'));
  pedir('/portal/api/sp', { timeout: 20000 }).then(r => r.ok ? ponKpi('sp', `${r.json.total}/${r.json.esperados}`, `${r.json.procedimientos.reduce((a, p) => a + p.llamadas, 0)} ejecuciones`) : ponKpi('sp', '—', String(r.status), 'mal'));
  abrirWS(1).then(async w => { const e = await w.esperar('estado_actual').catch(() => null); w.close(); ponKpi('wss', e ? 'Conectado' : 'Sin estado', e ? `último estado ${e.comando}` : ''); }).catch(e => ponKpi('wss', 'Sin conexión', e.message, 'mal'));
  ponKpi('https', location.protocol === 'https:' ? 'HTTPS' : 'HTTP', location.hostname, location.protocol === 'https:' ? 'ok' : 'av');
}

async function verificarTodo() {
  const b = $('#verificar-todo'); if (b) { b.disabled = true; b.innerHTML = '<i data-lucide="loader-2" class="i girando"></i>Verificando…'; iconos(b); }
  for (const c of C) { await correr(c); pintarPuntos(); }
  if (b) { b.disabled = false; b.innerHTML = '<i data-lucide="shield-check" class="i"></i>Verificar de nuevo'; iconos(b); }
  const ganados = C.filter(c => resultados[c.id] === 'ok').reduce((a, c) => a + c.pts, 0);
  toast(`${ganados} de 100 puntos verificados en vivo`);
}
async function correr(c) {
  let checks;
  try { checks = await c.verificar(); } catch (e) { checks = [{ t: 'Error al verificar', ok: false, det: e.message }]; }
  detalles[c.id] = checks;
  const fallas = checks.filter(x => x.ok === false).length, pend = checks.filter(x => x.ok === null).length;
  resultados[c.id] = fallas ? 'mal' : pend ? 'av' : 'ok';
  return checks;
}

function marcoVista(v, { eyebrow, titulo, texto, src, alto, abrir }) {
  v.classList.add('ancha');
  v.append(h(`<div class="seccion-cab" data-entra style="margin-bottom:16px"><div><span class="eyebrow">${eyebrow}</span><h1 class="t" style="margin-bottom:6px">${titulo}</h1><p class="lead">${texto}</p></div><a class="btn sec" href="${abrir}" target="_blank" rel="noopener"><i data-lucide="external-link" class="i"></i>Abrir en otra pestaña</a></div>`));
  v.append(h(`<div class="marco" data-entra><div class="marco-cab"><div class="luces"><i></i><i></i><i></i></div><div class="url">${esc(API + abrir)}</div></div><iframe src="${src}" title="${esc(titulo)}" style="height:${alto}"></iframe></div>`));
}
function vApi(v) { marcoVista(v, { eyebrow: 'Swagger UI · OpenAPI', titulo: 'API Vehículo IoT', texto: 'Documentación generada por FastAPI. Usa Authorize con la X-API-Key para probar las operaciones de control.', src: '/docs', alto: 'calc(100vh - 230px)', abrir: '/docs' }); }
function vSimulador(v) { marcoVista(v, { eyebrow: 'Simulador · WebSocket', titulo: 'Simulador DEMO', texto: 'Crea un vehículo con sus comandos, arma una DEMO de N movimientos y mírala llegar por WebSocket. Toma la X-API-Key guardada en este navegador.', src: '/control/simulador.html', alto: 'calc(100vh - 230px)', abrir: '/control/simulador.html' }); }
function vControl(v) {
  v.classList.add('ancha');
  v.append(h(`<div class="control-lay">
    <div data-entra>
      <span class="eyebrow">Control remoto · WSS</span><h1 class="t">Control real</h1>
      <p class="lead">El mismo control que usa el vehículo físico. Cada botón llama a la API; el ESP32 escucha el WebSocket del vehículo y mueve los motores.</p>
      <div class="seccion grid g2">
        <div class="tarjeta p"><h3 class="t">RC clásico</h3><p class="muted" style="margin:6px 0 0;font-size:13.5px">Un pulso: el vehículo sigue la acción hasta que eliges otra o presionas ALTO. Cada toque es un POST que queda en el historial.</p></div>
        <div class="tarjeta p"><h3 class="t">Gamepad</h3><p class="muted" style="margin:6px 0 0;font-size:13.5px">Se mueve mientras mantienes el botón; los avisos mantener y soltar viajan por el WebSocket sin latencia HTTP.</p></div>
        <div class="tarjeta p"><h3 class="t">Flujo de una orden</h3><p class="muted" style="margin:6px 0 0;font-size:13.5px">Control → API en EC2 (valida la clave) → SP en RDS → evento WSS → ESP32 → motores, en menos de un segundo.</p></div>
        <div class="tarjeta p"><h3 class="t">Acceso</h3><p class="muted" style="margin:6px 0 0;font-size:13.5px">El control pide la X-API-Key al entrar. <a href="/control/" target="_blank" rel="noopener">Abrir en el celular</a> para usarlo en horizontal.</p></div>
      </div>
    </div>
    <div class="telefono" data-entra><iframe src="/control/" title="Control real del vehículo"></iframe></div>
  </div>`));
}

/* ----- Página de criterio ----- */
function vGuia(v, c) {
  v.append(h(`<div class="guia-cab" data-entra>
    <div><span class="eyebrow"><i data-lucide="${c.icono}" class="i"></i>Criterio ${c.num} de ${C.length}</span><h1 class="t">${esc(c.tec)}</h1><p class="lead">${esc(c.intro)}</p></div>
    <div class="medalla"><div><b>${c.pts}</b><span>puntos</span></div><span class="chip" data-criterio-estado="${c.id}">Pendiente</span></div>
  </div>`));
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
    else panel.append(h(`<ol class="pasos">${c.pasos.map(([t, p]) => `<li><div><b>${esc(t)}</b><p>${esc(p)}</p></div></li>`).join('')}</ol>`));
    iconos(panel);
    if (movimiento) gsap.from(panel.children, { opacity: 0, y: 8, duration: .3, stagger: .03, clearProps: 'all' });
  };
  barra.addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostrar(b.dataset.tab); });
  mostrar('comprobar');

  const i = C.indexOf(c), ant = C[i - 1], sig = C[i + 1];
  v.append(h(`<div class="seccion" style="display:flex;justify-content:space-between;gap:10px">
    ${ant ? `<a class="btn sec" href="#/guia/${ant.id}"><i data-lucide="arrow-left" class="i"></i>${esc(ant.tec)}</a>` : '<span></span>'}
    ${sig ? `<a class="btn sec" href="#/guia/${sig.id}">${esc(sig.tec)}<i data-lucide="arrow-right" class="i"></i></a>` : '<a class="btn sec" href="#/inicio">Volver al inicio</a>'}
  </div>`));
}

function panelComprobar(panel, c) {
  panel.append(h(`<div class="seccion-cab"><p class="muted" style="margin:0;font-size:13.5px">Se ejecuta contra la API pública en este momento.</p><button class="btn pri" id="btn-verificar"><i data-lucide="play" class="i"></i>Verificar</button></div>`));
  const lista = h('<div class="checks"></div>'); panel.append(lista);
  const pintar = checks => {
    lista.innerHTML = checks.map(x => `<div class="check ${x.ok === true ? 'ok' : x.ok === false ? 'mal' : ''}"><span class="ico"><i data-lucide="${x.ok === true ? 'check' : x.ok === false ? 'x' : 'minus'}" class="i" style="width:13px;height:13px"></i></span><div><b>${esc(x.t)}</b><div class="det">${esc(x.det || '')}</div></div><span class="chip ${x.ok === true ? 'ok' : x.ok === false ? 'mal' : 'av'}">${x.ok === true ? 'Cumple' : x.ok === false ? 'No cumple' : 'Manual'}</span></div>`).join('');
    iconos(lista);
    if (movimiento) gsap.from(lista.children, { opacity: 0, x: -6, duration: .3, stagger: .05, clearProps: 'all' });
  };
  if (detalles[c.id]) pintar(detalles[c.id]); else lista.innerHTML = '<div class="vacio">Pulsa Verificar para ejecutar las comprobaciones.</div>';
  const btn = $('#btn-verificar', panel);
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="i girando"></i>Verificando…'; iconos(btn);
    lista.innerHTML = '<div class="check run"><span class="ico"><i data-lucide="loader-2" class="i girando" style="width:13px;height:13px"></i></span><div><b>Ejecutando comprobaciones…</b></div></div>'; iconos(lista);
    pintar(await correr(c)); pintarPuntos();
    btn.disabled = false; btn.innerHTML = '<i data-lucide="rotate-cw" class="i"></i>Verificar de nuevo'; iconos(btn);
  });
  if (!detalles[c.id]) btn.click();
}

/* ----- Extras ----- */
async function renderCodigo(el) {
  const lay = h(`<div class="codigo-lay"><div class="arbol" aria-label="Archivos"></div><div class="visor"><div class="visor-cab"><i data-lucide="file-code-2" class="i"></i><b id="v-ruta">Cargando…</b><span id="v-lineas" class="muted"></span><span style="flex:1"></span><button class="btn chico sec" id="v-copiar"><i data-lucide="copy" class="i"></i>Copiar</button></div><pre><code id="v-codigo"></code></pre></div></div>`);
  el.append(lay); iconos(lay);
  if (!cacheCodigo) { const r = await pedir('/portal/api/codigo'); cacheCodigo = r.json || []; }
  const grupos = {};
  for (const f of cacheCodigo) { if (f.ruta.endsWith('__init__.py') && f.lineas <= 2) continue; const partes = f.ruta.split('/'); const carpeta = partes.length > 1 ? partes.slice(0, -1).join('/') : 'raíz'; (grupos[carpeta] ||= []).push(f); }
  const arbol = $('.arbol', lay);
  arbol.innerHTML = Object.entries(grupos).map(([g, fs]) => `<div class="carpeta">${esc(g)}</div>${fs.map(f => `<button data-ruta="${esc(f.ruta)}"><i data-lucide="${f.ruta.endsWith('.py') ? 'file-code' : f.ruta.endsWith('.md') ? 'file-text' : 'file'}" class="i" style="width:14px;height:14px"></i>${esc(f.ruta.split('/').pop())}<small>${f.lineas}</small></button>`).join('')}`).join('');
  iconos(arbol);
  const abrir = ruta => {
    const f = cacheCodigo.find(x => x.ruta === ruta); if (!f) return;
    $$('button', arbol).forEach(b => b.setAttribute('aria-current', b.dataset.ruta === ruta));
    $('#v-ruta', lay).textContent = f.ruta; $('#v-lineas', lay).textContent = `· ${f.lineas} líneas`;
    const lang = f.ruta.endsWith('.py') ? 'python' : f.ruta.endsWith('.ps1') ? 'powershell' : f.ruta.endsWith('.md') ? 'markdown' : 'plaintext';
    let html = esc(f.contenido);
    try { if (window.hljs && lang !== 'plaintext') html = hljs.highlight(f.contenido, { language: lang, ignoreIllegals: true }).value; } catch {}
    $('#v-codigo', lay).innerHTML = html.split('\n').map(l => `<span class="ln">${l || ' '}</span>`).join('');
    $('#v-copiar', lay).onclick = () => copiar(f.contenido);
  };
  arbol.addEventListener('click', e => { const b = e.target.closest('button'); if (b) abrir(b.dataset.ruta); });
  abrir(cacheCodigo.find(f => f.ruta === 'app/main.py') ? 'app/main.py' : cacheCodigo[0]?.ruta);
}

const CAPAS = [
  ['Rutas', 'app/rutas', 'Reciben la petición, validan con Pydantic y responden. No conocen la base de datos.'],
  ['Contenedor', 'app/dependencias.py', 'Crea una sola vez los objetos y los inyecta; valida la X-API-Key.'],
  ['Servicios', 'app/servicios', 'Reglas de negocio: validar vehículo y comando, transacciones, DEMO asíncrona.'],
  ['Tiempo real', 'app/tiempo_real', 'Clientes WebSocket agrupados por vehículo; un evento solo llega a los suyos.'],
  ['Repositorio', 'app/repositorios', 'Un método por cada uno de los 21 SP, sin reglas de negocio.'],
  ['Conexión', 'app/db', 'Abre la conexión a RDS, maneja commit/rollback y ejecuta callproc con parámetros enlazados.'],
  ['Configuración y modelos', 'app/config.py|app/modelos|app/errores.py', 'Lee el .env, define los JSON de entrada/salida y los errores de negocio.'],
];
async function renderPoo(el) {
  if (!cachePoo) { const r = await pedir('/portal/api/poo'); cachePoo = r.json || []; }
  el.append(h(`<div class="nota" style="margin:0 0 14px"><i data-lucide="lightbulb" class="i"></i><div><b>Por qué se separa así.</b> Cada capa cambia por un solo motivo. Si cambia la base (local → RDS) solo cambia la configuración; si cambia una regla, solo el servicio; si cambia la URL, solo la ruta. Así el código se prueba y se mantiene por partes.</div></div>`));
  const cont = h('<div class="capas"></div>');
  CAPAS.forEach(([nom, rutas, desc], i) => {
    const prefijos = rutas.split('|');
    const mods = cachePoo.filter(m => prefijos.some(p => m.modulo.startsWith(p)) && !m.modulo.endsWith('portal.py'));
    const clases = mods.flatMap(m => m.clases.map(k => ({ ...k, mod: m.modulo })));
    const fun = mods.filter(m => !m.clases.length).map(m => `<div class="clase"><div class="mod">${esc(m.modulo)}</div><p>${esc(m.doc || 'Endpoints')}</p><div class="met">${m.funciones.slice(0, 10).map(f => `<span>${esc(f)}()</span>`).join('')}</div></div>`).join('');
    cont.append(h(`<div class="capa"><div class="nom">${esc(nom)}<small>${esc(rutas.replace(/\|/g, ' · '))}</small><small style="font-family:var(--f-txt);font-size:12px;line-height:1.45;margin-top:4px">${esc(desc)}</small></div><div class="clases">${clases.map(k => `<div class="clase"><b>${esc(k.nombre)}</b>${k.bases.length ? `<span class="mod"> (${esc(k.bases.join(', '))})</span>` : ''}<div class="mod">${esc(k.mod)}</div>${k.doc ? `<p>${esc(k.doc)}</p>` : ''}<div class="met">${k.metodos.filter(m => m !== '__init__').slice(0, 12).map(m => `<span>${esc(m)}()</span>`).join('')}${k.metodos.length > 13 ? `<span>+${k.metodos.length - 13}</span>` : ''}</div></div>`).join('')}${fun}</div></div>`));
    if (i < CAPAS.length - 1) cont.append(h('<div class="flecha-capa"><i data-lucide="chevrons-down" class="i"></i></div>'));
  });
  el.append(cont); iconos(el);
  if (movimiento) gsap.from($$('.capa', cont), { opacity: 0, y: 12, duration: .4, stagger: .06, clearProps: 'all' });
}

async function renderSP(el) {
  const cab = h(`<div class="seccion-cab"><p class="muted" style="margin:0;font-size:13.5px">Leído de information_schema en Amazon RDS. "Ejecuciones" cuenta las llamadas reales desde que arrancó la API.</p><div class="consola-acciones"><button class="btn sec chico" id="sp-probar"><i data-lucide="play" class="i"></i>Probar consultas</button><button class="btn sec chico" id="sp-recargar"><i data-lucide="rotate-cw" class="i"></i>Actualizar</button></div></div>`);
  const tabla = h('<div class="tabla-wrap"><div class="vacio">Cargando procedimientos…</div></div>');
  el.append(cab, tabla); iconos(cab);
  const cargar = async () => {
    const r = await pedir('/portal/api/sp', { timeout: 20000 });
    if (!r.ok) { tabla.innerHTML = `<div class="vacio">No se pudo leer RDS (${r.status})</div>`; return; }
    const max = Math.max(1, ...r.json.procedimientos.map(p => p.llamadas));
    const orden = ['Vehículos', 'Comandos', 'Estado', 'Historial', 'DEMO', 'Movimientos DEMO', 'Otro'];
    const ps = [...r.json.procedimientos].sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo));
    tabla.innerHTML = `<table class="t"><thead><tr><th>Grupo</th><th>Procedimiento</th><th>Parámetros</th><th>Endpoint</th><th>Ejecuciones</th></tr></thead><tbody>${ps.map(p => `<tr><td><span class="chip">${esc(p.grupo)}</span></td><td class="mono"><b>${esc(p.sp)}</b></td><td class="mono muted">${esc(p.parametros.join(', ') || '—')}</td><td class="mono">${esc(p.endpoint)}</td><td><div style="display:flex;align-items:center;gap:10px"><span class="mono" style="width:34px;text-align:right">${p.llamadas}</span><div class="barra-uso" style="flex:1"><i style="width:${(p.llamadas / max) * 100}%"></i></div></div></td></tr>`).join('')}</tbody></table>`;
    if (movimiento) gsap.from($$('.barra-uso i', tabla), { scaleX: 0, transformOrigin: 'left', duration: .6, stagger: .015, ease: 'power2.out', clearProps: 'transform' });
  };
  $('#sp-recargar', cab).onclick = cargar;
  $('#sp-probar', cab).onclick = async () => {
    const b = $('#sp-probar', cab); b.disabled = true;
    const d = (await pedir('/vehiculos/1/demos')).json?.[0]?.id_demo || 1;
    await Promise.all(['/vehiculos', '/vehiculos/1', '/vehiculos/1/detalle', '/vehiculos/1/comandos', '/vehiculos/1/estado', '/vehiculos/1/historial', `/vehiculos/1/demos/${d}/movimientos`].map(r => pedir(r)));
    b.disabled = false; toast('Consultas ejecutadas'); cargar();
  };
  cargar();
}

function renderLab(el) {
  el.append(h(`<div class="tarjeta p" style="margin-bottom:12px"><div class="consola-acciones">
    <div class="campo" style="width:150px"><label for="lab-v">Vehículo</label><input id="lab-v" type="number" min="1" value="1"></div>
    <button class="btn pri" id="lab-con"><i data-lucide="plug-zap" class="i"></i>Conectar A y B</button>
    <button class="btn sec" id="lab-post"><i data-lucide="send" class="i"></i>POST movimiento</button>
    <button class="btn sec" id="lab-demo"><i data-lucide="play" class="i"></i>Iniciar DEMO</button>
    <button class="btn sec" id="lab-demo2"><i data-lucide="copy-x" class="i"></i>Segunda DEMO (409)</button>
    <button class="btn sec" id="lab-cancel"><i data-lucide="square" class="i"></i>Cancelar</button>
    <button class="btn sec" id="lab-recon"><i data-lucide="refresh-cw" class="i"></i>Reconectar B</button>
  </div><div class="det mono muted" id="lab-resp" style="margin-top:10px;font-size:12px">Las acciones POST usan la X-API-Key guardada en este navegador.</div></div>`));
  const lab = h(`<div class="lab">${['A', 'B'].map(x => `<div class="tarjeta cliente"><div class="cliente-cab"><span class="punto" id="lab-p${x}"></span><b>Cliente ${x}</b><span class="url" id="lab-u${x}">desconectado</span></div><div class="eventos" id="lab-e${x}"><div class="vacio">Sin eventos</div></div></div>`).join('')}</div>`);
  el.append(lab);
  const lista = h(`<div class="seccion checks" id="lab-checks"></div>`); el.append(lista);
  const req = { estado: 'Último estado al conectar (A y B)', post: 'Evento del POST en A y B', demo: 'DEMO: inicio, N pasos y fin', d409: 'Segunda DEMO rechazada (409)', cancel: 'Cancelación por WSS', recon: 'Reconexión con último estado' };
  const hecho = {};
  const pintarReq = () => { lista.innerHTML = Object.entries(req).map(([k, t]) => `<div class="check ${hecho[k] ? 'ok' : ''}"><span class="ico"><i data-lucide="${hecho[k] ? 'check' : 'circle-dashed'}" class="i" style="width:13px;height:13px"></i></span><div><b>${t}</b><div class="det">${esc(hecho[k] || 'pendiente')}</div></div><span class="chip ${hecho[k] ? 'ok' : ''}">${hecho[k] ? 'Demostrado' : 'Pendiente'}</span></div>`).join(''); iconos(lista); };
  pintarReq();
  const ws = {}, rec = { A: [], B: [] }; let pasos = 0;
  const resp = t => $('#lab-resp', el).textContent = t;
  const idV = () => +$('#lab-v', el).value || 1;
  function pintarEv(x, m) {
    const caja = $(`#lab-e${x}`, el); if (caja.querySelector('.vacio')) caja.innerHTML = '';
    let d = '';
    if (m.evento === 'estado_actual') d = `último estado: ${m.comando} · clientes ${m.clientes ?? ''}`;
    else if (m.evento === 'movimiento') d = `${m.comando} · ${m.origen}`;
    else if (m.evento === 'demo_inicio') d = `"${m.demo}" · ${m.total_movimientos} movimientos`;
    else if (m.evento === 'demo_movimiento') d = `${m.numero}/${m.total_movimientos} ${m.comando} · ${m.duracion_ms}+${m.pausa_ms} ms`;
    else if (m.evento === 'demo_fin') d = `enviados ${m.movimientos_enviados} · historial sin cambios`;
    else if (m.evento === 'demo_cancelada') d = `enviados ${m.movimientos_enviados}`;
    else d = m.detalle || '';
    const fila = h(`<div class="ev ${esc(m.evento)}"><span class="h">${hora()}</span><span class="e">${esc(m.evento)}</span><span class="d">${esc(d)}</span></div>`);
    caja.prepend(fila); if (movimiento) gsap.from(fila, { opacity: 0, y: -6, duration: .25 });
  }
  function evaluar(x, m) {
    rec[x].push(m.evento);
    if (m.evento === 'estado_actual' && rec.A.includes('estado_actual') && rec.B.includes('estado_actual')) hecho.estado ||= `A y B recibieron ${m.comando}`;
    if (m.evento === 'movimiento' && rec.A.includes('movimiento') && rec.B.includes('movimiento')) hecho.post = `${m.comando} · ${m.origen} en los dos clientes`;
    if (m.evento === 'demo_movimiento' && x === 'A') pasos = m.numero;
    if (m.evento === 'demo_fin' && x === 'A') hecho.demo = `${m.movimientos_enviados} pasos completos · ${m.historial}`;
    if (m.evento === 'demo_cancelada' && x === 'A') hecho.cancel = `cancelada después de ${m.movimientos_enviados} pasos`;
    pintarReq();
  }
  async function conectar(x) {
    ws[x]?.close();
    $(`#lab-u${x}`, el).textContent = 'conectando…';
    try {
      ws[x] = await abrirWS(idV(), m => { pintarEv(x, m); evaluar(x, m); });
      $(`#lab-p${x}`, el).className = 'punto ok'; $(`#lab-u${x}`, el).textContent = `${WSB}/ws/vehiculos/${idV()}`;
      ws[x].onclose = () => { $(`#lab-p${x}`, el).className = 'punto'; $(`#lab-u${x}`, el).textContent = 'desconectado'; };
    } catch (e) { $(`#lab-p${x}`, el).className = 'punto mal'; $(`#lab-u${x}`, el).textContent = e.message; }
  }
  const sinClave = () => { if (clave()) return false; abrirModal(); resp('Guarda la X-API-Key para las acciones POST'); return true; };
  $('#lab-con', el).onclick = () => { rec.A = []; rec.B = []; conectar('A'); conectar('B'); };
  $('#lab-post', el).onclick = async () => { if (sinClave()) return; const r = await pedir(`/vehiculos/${idV()}/movimientos`, { metodo: 'POST', cuerpo: { id_comando: 1, origen: 'PORTAL' }, conClave: true }); resp(`POST /vehiculos/${idV()}/movimientos → ${r.status} · ${r.json?.mensaje || r.json?.detail || ''} · clientes_notificados ${r.json?.clientes_notificados ?? '—'}`); };
  const idDemo = async () => (await pedir(`/vehiculos/${idV()}/demos`)).json?.[0]?.id_demo;
  $('#lab-demo', el).onclick = async () => { if (sinClave()) return; const d = await idDemo(); if (!d) return resp('Este vehículo no tiene DEMO'); const r = await pedir(`/vehiculos/${idV()}/demos/${d}/iniciar`, { metodo: 'POST', conClave: true }); resp(`POST …/demos/${d}/iniciar → ${r.status} · ${r.json?.mensaje || r.json?.detail || ''}`); };
  $('#lab-demo2', el).onclick = async () => { if (sinClave()) return; const d = await idDemo(); if (!d) return; const r1 = await pedir(`/vehiculos/${idV()}/demos/${d}/iniciar`, { metodo: 'POST', conClave: true }); await dormir(300); const r2 = await pedir(`/vehiculos/${idV()}/demos/${d}/iniciar`, { metodo: 'POST', conClave: true }); resp(`Primera → ${r1.status} · Segunda → ${r2.status} ${r2.json?.detail || ''}`); if (r2.status === 409) { hecho.d409 = r2.json?.detail || '409'; pintarReq(); } };
  $('#lab-cancel', el).onclick = async () => { if (sinClave()) return; const r = await pedir(`/vehiculos/${idV()}/demos/cancelar`, { metodo: 'POST', conClave: true }); resp(`POST …/demos/cancelar → ${r.status} · ${r.json?.mensaje || r.json?.detail || ''}`); };
  $('#lab-recon', el).onclick = async () => {
    ws.B?.close(); await dormir(500); rec.B = rec.B.filter(e => e !== 'estado_actual');
    await conectar('B'); try { const e = await ws.B.esperar('estado_actual'); hecho.recon = `B volvió a recibir ${e.comando}`; pintarReq(); } catch {}
  };
  iconos(el);
}

function renderThunder(el) {
  const base = API;
  const esc3 = [
    { t: 'Escenario 1 · POST movimiento + WSS', m: 'POST', u: `${base}/vehiculos/1/movimientos`, hd: true, body: '{"id_comando": 1, "origen": "THUNDER-CLIENT"}', espera: ['200 OK · "Movimiento registrado"', 'clientes_notificados: 2 con dos pestañas WSS abiertas', `WSS en Postman: ${WSB}/ws/vehiculos/1 recibe "movimiento"`, 'GET historial: el nuevo registro aparece primero'] },
    { t: 'Escenario 2 · GET historial', m: 'GET', u: `${base}/vehiculos/1/historial`, hd: false, espera: ['200 OK', 'limite: 10 · total_devueltos ≤ 10', 'id_historial del mayor al menor', 'Sin movimientos de DEMO'] },
    { t: 'Escenario 3 · DEMO por WSS', m: 'POST', u: `${base}/vehiculos/1/demos/1/iniciar`, hd: true, espera: ['202 Accepted · "DEMO iniciada" con N movimientos', 'WSS: demo_inicio, N demo_movimiento y demo_fin', 'GET historial: el más reciente no cambia', 'GET estado: último paso de la DEMO'] },
  ];
  const cont = h('<div class="grid"></div>');
  esc3.forEach(e => cont.append(h(`<div class="tarjeta peticion"><h3 class="t">${esc(e.t)}</h3>
    <div class="linea"><span class="metodo ${e.m === 'GET' ? 'get' : 'post'}">${e.m}</span><span>${esc(e.u)}</span><button class="btn chico sec copiar" data-copiar="${esc(e.u)}"><i data-lucide="copy" class="i"></i>URL</button></div>
    <div class="kv">${e.hd ? '<span>Header</span><span>X-API-Key: (tu clave)</span>' : ''}${e.body ? `<span>Body JSON</span><span>${esc(e.body)} <button class="btn chico sec" style="margin-left:6px" data-copiar="${esc(e.body)}">Copiar</button></span>` : '<span>Body</span><span>vacío</span>'}</div>
    <div><span class="eyebrow" style="font-size:10px">Qué debe verse</span><ul style="margin:6px 0 0;padding-left:18px;color:var(--suave);font-size:13.5px">${e.espera.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`)));
  el.append(h(`<div class="seccion-cab"><p class="muted" style="margin:0;font-size:13.5px">La colección usa las variables <code>base</code> y <code>apikey</code>. Thunder Client la importa desde Collections → Import (formato Postman v2.1).</p><button class="btn pri" id="th-desc"><i data-lucide="download" class="i"></i>Descargar colección</button></div>`), cont);
  el.addEventListener('click', e => { const b = e.target.closest('[data-copiar]'); if (b) copiar(b.dataset.copiar); });
  $('#th-desc', el).onclick = () => {
    const req = (nombre, metodo, ruta, body, conClave) => ({ name: nombre, request: { method: metodo, header: conClave ? [{ key: 'X-API-Key', value: '{{apikey}}' }] : [], url: { raw: `{{base}}${ruta}`, host: ['{{base}}'], path: ruta.split('/').filter(Boolean) }, ...(body ? { body: { mode: 'raw', raw: body, options: { raw: { language: 'json' } } } } : {}) } });
    const col = { info: { name: 'Vehículo IoT · Examen 2.6', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      variable: [{ key: 'base', value: base }, { key: 'apikey', value: '' }],
      item: [req('1 · POST movimiento', 'POST', '/vehiculos/1/movimientos', '{"id_comando": 1, "origen": "THUNDER-CLIENT"}', true), req('2 · GET historial', 'GET', '/vehiculos/1/historial'), req('3 · POST iniciar DEMO', 'POST', '/vehiculos/1/demos/1/iniciar', null, true), req('GET estado', 'GET', '/vehiculos/1/estado')] };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(col, null, 2)], { type: 'application/json' })); a.download = 'vehiculo-iot-examen-2.6.postman_collection.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  iconos(el);
}

async function renderGithub(el) {
  el.append(h(`<div class="seccion-cab"><a class="btn sec" href="https://github.com/${REPO}" target="_blank" rel="noopener"><i data-lucide="github" class="i"></i>github.com/${REPO}</a></div>`));
  const lista = h('<div class="tabla-wrap"><div class="vacio">Consultando GitHub…</div></div>'); el.append(lista); iconos(el);
  const r = await pedir(`https://api.github.com/repos/${REPO}/commits?per_page=30`);
  if (!r.ok) { lista.innerHTML = `<div class="vacio">GitHub no respondió (${r.status})</div>`; return; }
  lista.innerHTML = `<table class="t"><thead><tr><th>Commit</th><th>Mensaje</th><th>Fecha</th></tr></thead><tbody>${r.json.map(c => `<tr><td class="mono"><a href="${esc(c.html_url)}" target="_blank" rel="noopener">${esc(c.sha.slice(0, 7))}</a></td><td>${esc(c.commit.message.split('\n')[0])}</td><td class="mono muted" style="white-space:nowrap">${esc(new Date(c.commit.author.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }))}</td></tr>`).join('')}</tbody></table>`;
}

/* ======================= Barra superior ======================= */
function pintarClave() {
  const b = $('#pil-clave'); const tiene = !!clave();
  b.innerHTML = `<i data-lucide="${tiene ? 'key-round' : 'key'}" class="i" style="width:14px;height:14px;color:${tiene ? 'var(--ok)' : 'inherit'}"></i><span>${tiene ? 'Clave guardada' : 'Sin clave'}</span>`; iconos(b);
}
function abrirModal() { $('#modal-clave').hidden = false; $('#mc-valor').value = ''; setTimeout(() => $('#mc-valor').focus(), 30); }
function cerrarModal() { $('#modal-clave').hidden = true; }
$('#pil-clave').onclick = abrirModal;
$('#mc-guardar').onclick = () => { const v = $('#mc-valor').value.trim(); if (v) { ponerClave(v); toast('Clave guardada en este navegador'); } cerrarModal(); };
$('#mc-borrar').onclick = () => { ponerClave(''); toast('Clave eliminada'); cerrarModal(); };
$('#modal-clave').addEventListener('click', e => { if (e.target.id === 'modal-clave') cerrarModal(); });
$('#mc-valor').addEventListener('keydown', e => { if (e.key === 'Enter') $('#mc-guardar').click(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { cerrarModal(); $('#lado').classList.remove('abierto'); } });
$('#tema').onclick = () => {
  const actual = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const nuevo = actual === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nuevo;
  try { localStorage.setItem('portal.tema', nuevo); } catch {}
};
$('#abrir-menu').onclick = () => $('#lado').classList.toggle('abierto');
$('#pil-api').onclick = () => { location.hash = '#/inicio'; };

async function latido() {
  const r = await pedir('/', { timeout: 6000 });
  const p = $('#pil-api'); p.innerHTML = `<span class="punto ${r.ok ? 'ok' : 'mal'}"></span><span>${r.ok ? `API · ${r.ms} ms` : 'API sin respuesta'}</span>`;
}

/* ======================= Arranque ======================= */
pintarNav(); pintarClave(); iconos();
window.addEventListener('hashchange', navegar);
navegar(); latido(); setInterval(latido, 30000);
})();
