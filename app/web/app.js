// Control Excavadora IoT: login, selector de control y dos modos de manejo.
//  - RC Clásico (pulso): un toque -> modo "continuo" (sigue hasta la siguiente orden o ALTO)
//  - Gamepad (mantener): presionar -> modo "mantener" + aviso /mantener cada 400 ms; soltar -> /soltar
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const API = location.origin;
  const B = document.body;
  const guardado = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };
  const esMovil = () => matchMedia('(pointer: coarse)').matches;

  const st = {
    idV: Number(guardado('ctl.vehiculo')) || null,
    comandos: new Map(), demos: [], movsDemo: new Map(),
    ws: null, reintento: 0, ping: null, demoEnCurso: null,
    sostenido: null,   // { nombre, boton, timer } en el gamepad
  };
  const clave = () => guardado('ctl.apikey') || '';
  const origen = () => guardado('ctl.origen') || 'WEB-CONTROL';

  // ---------- Utilidades ----------
  async function pedir(ruta, op = {}) {
    const r = await fetch(API + ruta, op);
    let c = null; try { c = await r.json(); } catch { /* sin cuerpo */ }
    if (!r.ok) {
      const d = c && c.detail;
      const e = new Error(Array.isArray(d) ? d.map(x => x.msg).join('; ') : (d || `Error ${r.status}`)); e.status = r.status; throw e;
    }
    return c;
  }
  const post = (ruta, cuerpo, k = clave()) => pedir(ruta, {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': k },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let avisoT;
  function aviso(t, mal = false) {
    const a = $('#aviso'); a.textContent = t; a.classList.toggle('mal', mal); a.classList.add('ver');
    clearTimeout(avisoT); avisoT = setTimeout(() => a.classList.remove('ver'), 2600);
  }
  const bonito = (n) => String(n || '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  const hora = (iso) => { const d = iso ? new Date(iso) : new Date(); return isNaN(d) ? '--:--' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vibrar = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* sin vibración */ } };

  // ---------- Pantallas ----------
  function ir(p) { B.dataset.pantalla = p; window.scrollTo(0, 0); }

  // ---------- LOGIN ----------
  $('#form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const k = $('#login-clave').value.trim();
    const o = ($('#login-origen').value.trim() || 'WEB-CONTROL').toUpperCase().slice(0, 30);
    const btn = $('#login-entrar'); btn.disabled = true; btn.textContent = 'Verificando…'; $('#login-error').textContent = '';
    try {
      await cargarVehiculos();
      await post(`/vehiculos/${st.idV}/soltar`, null, k);     // valida la clave sin mover nada
      guardado('ctl.apikey', k); guardado('ctl.origen', o);
      ir('selector');
    } catch (e) {
      $('#login-error').textContent = e.status === 401 || e.status === 403 ? 'Clave incorrecta. Revisa la X-API-Key del servidor.' : `No se pudo conectar: ${e.message}`;
    } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
  });

  function salir() {
    soltarSostenido(); guardado('ctl.apikey', null);
    if (st.ws) { st.ws.onclose = null; st.ws.close(); st.ws = null; }
    cerrarHoja(); $('#login-clave').value = ''; ir('login');
  }

  // ---------- SELECTOR ----------
  $$('[data-elegir]').forEach(b => b.addEventListener('click', () => usarControl(b.dataset.elegir)));
  async function usarControl(tipo) {
    B.dataset.control = tipo; guardado('ctl.control', tipo);
    $('#marca-control').textContent = tipo === 'rc' ? 'RC · CLÁSICO' : 'GAMEPAD';
    $('#lcd-modo').textContent = tipo === 'rc' ? 'PULSO' : 'MANTENER';
    $('#ayuda').textContent = tipo === 'rc'
      ? 'Toca una acción: la excavadora sigue hasta que eliges otra o presionas ALTO.'
      : 'Mantén presionado un botón para moverte; al soltarlo se detiene.';
    if (!guardado('ctl.orient')) B.dataset.orient = esMovil() && innerHeight > innerWidth ? 'v' : 'h';
    actualizarTextoGirar();
    ir('control');
    await cargarVehiculo(st.idV);
  }

  // ---------- Vehículos y comandos ----------
  async function cargarVehiculos() {
    const lista = await pedir('/vehiculos');
    if (!lista.length) throw new Error('No hay vehículos registrados');
    if (!lista.some(v => v.id_vehiculo === st.idV)) st.idV = lista[0].id_vehiculo;
    $('#vehiculo').innerHTML = lista.map(v => `<option value="${v.id_vehiculo}" ${v.id_vehiculo === st.idV ? 'selected' : ''}>${esc(v.nombre)}</option>`).join('');
  }
  $('#vehiculo').addEventListener('change', (e) => cargarVehiculo(Number(e.target.value)));

  async function cargarVehiculo(id) {
    st.idV = id; guardado('ctl.vehiculo', String(id)); st.movsDemo.clear(); st.demoEnCurso = null;
    try {
      const d = await pedir(`/vehiculos/${id}/detalle`);
      st.comandos = new Map(d.comandos.map(c => [c.nombre, c]));
      $$('#remoto [data-cmd]').forEach(b => {
        const c = st.comandos.get(b.dataset.cmd);
        b.disabled = !c || !c.activo;
        b.hidden = !c && (b.classList.contains('hombro') || b.classList.contains('funcion'));
      });
      $('.funciones').hidden = !$$('.funcion:not([hidden])').length;
      pintarEstado(d.estado);
      st.demos = d.demos;
      conectar();
    } catch (e) { aviso(e.message, true); }
  }

  // ---------- Envío de órdenes ----------
  async function enviar(nombre, modo) {
    const c = st.comandos.get(nombre); if (!c) return null;
    // Por el WebSocket ya abierto: sin el costo de una petición HTTPS, la orden llega antes al vehículo.
    // Resuelve cuando vuelve el evento "movimiento" (o a los 3 s), para que el "soltar" del gamepad vaya después.
    if (st.ws && st.ws.readyState === 1) {
      st.ws.send(JSON.stringify({ accion: 'mover', clave: clave(), id_comando: c.id_comando, origen: origen(), modo }));
      return new Promise(ok => {
        const fin = (m) => { clearTimeout(t); st.esperas = st.esperas.filter(f => f !== fin); ok(m); };
        const t = setTimeout(() => fin(null), 3000);
        (st.esperas ||= []).push(fin);
      });
    }
    try {
      const r = await post(`/vehiculos/${st.idV}/movimientos`, { id_comando: c.id_comando, origen: origen(), modo });
      pintarEstado(r.estado);
      return r;
    } catch (e) {
      if (e.status === 401 || e.status === 403) { aviso('La sesión expiró: vuelve a iniciar sesión.', true); salir(); }
      else aviso(e.message, true);
      return null;
    }
  }

  // RC Clásico: un toque
  function pulsoRC(boton) {
    const nombre = boton.dataset.cmd;
    vibrar(18);
    boton.classList.add('presionada'); setTimeout(() => boton.classList.remove('presionada'), 140);
    $$('#remoto .activa').forEach(b => b.classList.remove('activa'));
    if (nombre === 'DETENER') { B.classList.remove('moviendo'); enviar('DETENER', 'toque'); return; }
    boton.classList.add('activa'); B.classList.add('moviendo');
    enviar(nombre, 'continuo');
  }

  // Aviso rápido por el WebSocket abierto (si no está abierto, por HTTP)
  function avisoRapido(accion) {
    if (st.ws && st.ws.readyState === 1) { st.ws.send(JSON.stringify({ accion, clave: clave() })); return; }
    post(`/vehiculos/${st.idV}/${accion}`).catch(() => {});
  }

  // Gamepad: mantener
  function presionarPad(boton) {
    const nombre = boton.dataset.cmd;
    soltarSostenido();
    vibrar(12); boton.classList.add('presionada');
    if (nombre === 'DETENER') { enviar('DETENER', 'toque'); return; }
    B.classList.add('moviendo');
    const s = { nombre, boton, timer: null };
    st.sostenido = s;
    s.orden = enviar(nombre, 'mantener');      // promesa: el "soltar" se manda después de esta orden
    s.timer = setInterval(() => { if (st.sostenido === s) avisoRapido('mantener'); }, 300);
  }
  function soltarSostenido() {
    const s = st.sostenido; if (!s) return;
    clearInterval(s.timer); s.boton.classList.remove('presionada'); st.sostenido = null; B.classList.remove('moviendo');
    avisoRapido('soltar');                        // inmediato (por si la orden ya llegó)
    Promise.resolve(s.orden).then(() => { if (!st.sostenido) avisoRapido('soltar'); });   // y otra vez tras la orden (si no hay otro botón presionado)
  }

  // Eventos de botones (puntero: mouse, touch y pluma)
  const remoto = $('#remoto');
  remoto.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('[data-cmd]'); if (!b || b.disabled) return;
    ev.preventDefault();
    if (b.hasAttribute('data-sostener')) { presionarPad(b); return; }   // ON/OFF: activo mientras se mantenga presionado (cualquier modo)
    if (b.hasAttribute('data-toque')) {                // funciones: siempre un toque corto
      vibrar(15); b.classList.add('presionada'); setTimeout(() => b.classList.remove('presionada'), 220);
      enviar(b.dataset.cmd, 'toque'); return;
    }
    if (B.dataset.control === 'rc') { pulsoRC(b); return; }
    presionarPad(b);
  });
  const fin = (ev) => {
    if (B.dataset.control !== 'pad') { if (st.sostenido) soltarSostenido(); return; }
    botonDe('DETENER')?.classList.remove('presionada');
    if (st.sostenido) soltarSostenido();
  };
  // Se escucha en toda la ventana: el dedo puede salir del botón antes de soltar
  addEventListener('pointerup', fin);
  addEventListener('pointercancel', fin);
  remoto.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('blur', () => { if (st.sostenido) soltarSostenido(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && st.sostenido) soltarSostenido(); });

  // Teclado (PC)
  const TECLAS = {
    ArrowUp: 'AVANZAR', ArrowDown: 'RETROCEDER', ArrowLeft: 'GIRAR_IZQUIERDA', ArrowRight: 'GIRAR_DERECHA', ' ': 'DETENER',
    w: 'SUBIR_BRAZO', s: 'BAJAR_BRAZO', a: 'ROTAR_IZQUIERDA', d: 'ROTAR_DERECHA',
  };
  const botonDe = (n) => $(`#remoto [data-cmd="${n}"]`);
  document.addEventListener('keydown', (ev) => {
    if (B.dataset.pantalla !== 'control' || ev.repeat || ev.target.closest('input, select')) return;
    const n = TECLAS[ev.key] || TECLAS[ev.key.toLowerCase()]; const b = n && botonDe(n);
    if (!b || b.disabled) return;
    ev.preventDefault();
    B.dataset.control === 'rc' ? pulsoRC(b) : presionarPad(b);
  });
  document.addEventListener('keyup', (ev) => {
    if (B.dataset.control !== 'pad') return;
    const n = TECLAS[ev.key] || TECLAS[ev.key.toLowerCase()];
    if (n === 'DETENER') botonDe('DETENER')?.classList.remove('presionada');
    if (st.sostenido && st.sostenido.nombre === n) soltarSostenido();
  });

  // ---------- LCD ----------
  function pintarEstado(e) {
    if (!e) return;
    if (e.comando !== undefined) $('#lcd-cmd').textContent = e.comando ? bonito(e.comando) : '—';
    $('#lcd-hora').textContent = hora(e.fecha_actualizacion || e.timestamp);
  }
  function pintarEnlace(on) {
    B.classList.toggle('en-linea', on);
    $('#lcd-enlace').textContent = on ? '● EN LÍNEA' : '○ SIN ENLACE';
  }

  // ---------- WebSocket ----------
  function conectar() {
    if (st.ws) { st.ws.onclose = null; st.ws.close(); }
    clearInterval(st.ping);
    const ws = new WebSocket(API.replace(/^http/, 'ws') + `/ws/vehiculos/${st.idV}`);
    st.ws = ws;
    ws.onopen = () => { st.reintento = 0; pintarEnlace(true); st.ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (['pong', 'mantener'].includes(m.evento)) return;
      registrarEvento(m);
      switch (m.evento) {
        case 'estado_actual': pintarEstado(m); if (!m.demo_en_curso) demoTermina(false); break;
        case 'movimiento': pintarEstado(m); $('#lcd-info').textContent = (m.origen || '').slice(0, 14); if (!$('#hoja').hidden) cargarHistorial();
          (st.esperas || []).slice().forEach(f => f(m)); break;
        case 'demo_inicio': demoEnMarcha(m); aviso(`DEMO "${m.demo}" en marcha`); break;
        case 'demo_movimiento': pintarEstado(m); demoPaso(m); break;
        case 'demo_fin': demoTermina(true); aviso('DEMO terminada'); break;
        case 'demo_cancelada': demoTermina(true); aviso('DEMO cancelada', true); break;
        case 'demo_error': case 'error': demoTermina(true); aviso(m.detalle || 'Error', true); (st.esperas || []).slice().forEach(f => f(null)); break;
        case 'soltar': $$('#remoto .activa').forEach(b => b.classList.remove('activa')); break;
      }
    };
    ws.onclose = () => {
      clearInterval(st.ping); pintarEnlace(false);
      const espera = Math.min(15000, 1000 * 2 ** st.reintento++);
      setTimeout(() => { if (st.ws === ws && B.dataset.pantalla === 'control') conectar(); }, espera);
    };
  }

  // ---------- DEMO ----------
  async function pintarDemos() {
    const ul = $('#lista-demos');
    if (!st.demos.length) { ul.innerHTML = '<li class="vacio">Este vehículo no tiene rutinas DEMO.</li>'; return; }
    await Promise.all(st.demos.map(async d => {
      if (!st.movsDemo.has(d.id_demo)) {
        try { st.movsDemo.set(d.id_demo, await pedir(`/vehiculos/${st.idV}/demos/${d.id_demo}/movimientos`)); } catch { st.movsDemo.set(d.id_demo, []); }
      }
    }));
    ul.innerHTML = st.demos.map(d => {
      const movs = st.movsDemo.get(d.id_demo) || []; const ms = movs.reduce((s, m) => s + m.duracion_ms + m.pausa_ms, 0);
      return `<li class="demo"><strong>${esc(d.nombre)}</strong>${d.descripcion ? `<p>${esc(d.descripcion)}</p>` : ''}
        <span class="meta">${movs.length} movimientos · ${(ms / 1000).toFixed(1)} s</span>
        <button type="button" class="btn-azul" data-demo="${d.id_demo}" ${d.activo && movs.length && !st.demoEnCurso ? '' : 'disabled'}>Iniciar</button></li>`;
    }).join('');
  }
  $('#lista-demos').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-demo]'); if (!b) return;
    b.disabled = true;
    try { await post(`/vehiculos/${st.idV}/demos/${b.dataset.demo}/iniciar`); cerrarHoja(); }
    catch (e) { aviso(e.message, true); b.disabled = false; }
  });
  $('#btn-cancelar').addEventListener('click', async () => { try { await post(`/vehiculos/${st.idV}/demos/cancelar`); } catch (e) { aviso(e.message, true); } });
  function demoEnMarcha(m) {
    st.demoEnCurso = m.id_demo; $('#btn-cancelar').hidden = false;
    $('#lcd-info').textContent = `DEMO 0/${m.total_movimientos}`; $('#lcd-barra').style.width = '0';
  }
  function demoPaso(m) {
    if (st.demoEnCurso !== m.id_demo) demoEnMarcha(m);
    $('#lcd-info').textContent = `DEMO ${m.numero}/${m.total_movimientos}`;
    $('#lcd-barra').style.width = (m.numero / m.total_movimientos * 100) + '%';
  }
  function demoTermina(habia) {
    if (!st.demoEnCurso && !habia) return;
    st.demoEnCurso = null; $('#btn-cancelar').hidden = true; $('#lcd-info').textContent = 'LISTO';
    setTimeout(() => { $('#lcd-barra').style.width = '0'; }, 800);
    if (!$('#hoja').hidden) pintarDemos();
  }

  // ---------- Historial y eventos ----------
  async function cargarHistorial() {
    try {
      const h = await pedir(`/vehiculos/${st.idV}/historial`);
      $('#lista-historial').innerHTML = h.movimientos.length
        ? h.movimientos.map(m => `<li><span class="num">#${m.id_historial}</span><span><span class="cmd">${esc(bonito(m.comando))}</span><span class="org">${esc(m.origen)}</span></span><time>${hora(m.fecha_hora)}</time></li>`).join('')
        : '<li class="vacio">Sin movimientos registrados.</li>';
    } catch (e) { $('#lista-historial').innerHTML = `<li class="vacio">${esc(e.message)}</li>`; }
  }
  function registrarEvento(m) {
    const l = $('#lista-eventos');
    const det = m.comando ? bonito(m.comando) + (m.modo ? ` · ${m.modo}` : '') + (m.duracion_ms ? ` · ${m.duracion_ms} ms` : '') : (m.demo || m.detalle || '');
    l.insertAdjacentHTML('afterbegin', `<li><span class="tipo">${esc(m.evento)}</span><span class="cmd">${esc(det)}</span><time>${hora(m.timestamp)}</time></li>`);
    while (l.children.length > 60) l.lastElementChild.remove();
  }

  // ---------- Hoja ----------
  function abrirHoja(tab) {
    $('#hoja').hidden = false; $('#hoja-fondo').hidden = false; elegirTab(tab || 'demos');
  }
  function cerrarHoja() { $('#hoja').hidden = true; $('#hoja-fondo').hidden = true; }
  function elegirTab(tab) {
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
    if (tab === 'demos') pintarDemos();
    if (tab === 'historial') cargarHistorial();
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => elegirTab(t.dataset.tab)));
  $('#hoja-fondo').addEventListener('click', cerrarHoja);

  // ---------- Girar ----------
  function actualizarTextoGirar() { $('#txt-girar').textContent = B.dataset.orient === 'h' ? 'Vertical' : 'Horizontal'; }
  async function girar() {
    B.dataset.orient = B.dataset.orient === 'h' ? 'v' : 'h'; guardado('ctl.orient', B.dataset.orient); actualizarTextoGirar();
    // En Android, si se puede, pone la pantalla completa y fija la orientación real
    if (esMovil() && document.documentElement.requestFullscreen && screen.orientation?.lock) {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        await screen.orientation.lock(B.dataset.orient === 'h' ? 'landscape' : 'portrait');
      } catch { /* iPhone u otro: se usa el giro por CSS */ }
    }
  }

  // ---------- Acciones generales ----------
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-accion]'); if (!a) return;
    const acc = a.dataset.accion;
    if (acc === 'salir') salir();
    else if (acc === 'cambiar') { soltarSostenido(); ir('selector'); }
    else if (acc === 'girar') girar();
    else if (acc === 'hoja') abrirHoja(a.dataset.tab);
    else if (acc === 'cerrar-hoja') cerrarHoja();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja(); });

  // ---------- Inicio ----------
  (async function iniciar() {
    B.dataset.orient = guardado('ctl.orient') || (esMovil() && innerHeight > innerWidth ? 'v' : 'h');
    $('#login-origen').value = origen() === 'WEB-CONTROL' ? '' : origen();
    if (!clave()) { ir('login'); return; }
    try {
      await cargarVehiculos();
      await post(`/vehiculos/${st.idV}/soltar`);
      const c = guardado('ctl.control');
      if (c) await usarControl(c); else ir('selector');
    } catch (e) {
      if (e.status === 401 || e.status === 403) guardado('ctl.apikey', null);
      ir('login');
    }
  })();
})();
