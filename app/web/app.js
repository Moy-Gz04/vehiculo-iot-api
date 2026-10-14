// Control Vehículo IoT: manda movimientos por POST y escucha al vehículo por WebSocket.
(() => {
  const $ = (s) => document.querySelector(s);
  const API = location.origin;
  const guardado = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };

  const estado = {
    idV: Number(guardado('ctl.vehiculo')) || null,
    comandos: new Map(),   // nombre -> comando
    demos: [],
    movsDemo: new Map(),   // id_demo -> movimientos
    ws: null, reintento: 0, ping: null,
    demoEnCurso: null,
  };
  const clave = () => guardado('ctl.apikey') || '';
  const origen = () => guardado('ctl.origen') || 'WEB-CONTROL';

  // ---------- Utilidades ----------
  async function pedir(ruta, opciones = {}) {
    const r = await fetch(API + ruta, opciones);
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* sin cuerpo */ }
    if (!r.ok) {
      const detalle = cuerpo && cuerpo.detail;
      const msg = Array.isArray(detalle) ? detalle.map(d => d.msg).join('; ') : (detalle || `Error ${r.status}`);
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return cuerpo;
  }
  const postClave = (ruta, cuerpo) => pedir(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': clave() },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let avisoT;
  function aviso(texto, mal = false) {
    const a = $('#aviso');
    a.textContent = texto; a.classList.toggle('mal', mal); a.classList.add('ver');
    clearTimeout(avisoT); avisoT = setTimeout(() => a.classList.remove('ver'), 2600);
  }
  const hora = (iso) => {
    if (!iso) return '—';
    const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + (iso.includes('T') ? '' : ''));
    return isNaN(d) ? iso : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bonito = (nombre) => String(nombre || '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

  // ---------- Telemetría ----------
  function pintarEstado(e) {
    if (!e) return;
    $('#comando-actual').textContent = e.comando ? bonito(e.comando) : '—';
    $('#codigo-actual').textContent = e.codigo ?? '—';
    $('#hora-actual').textContent = hora(e.fecha_actualizacion || e.timestamp);
    if ('conectado' in e) {
      const p = $('#pill-conectado');
      p.dataset.estado = e.conectado ? 'on' : 'off';
      p.textContent = e.conectado ? 'Conectado' : 'Desconectado';
    }
    document.querySelectorAll('[data-cmd]').forEach(b => b.classList.toggle('activa', b.dataset.cmd === e.comando));
  }
  function pintarEnlace(on, texto) {
    const p = $('#pill-ws');
    p.dataset.estado = on === true ? 'on' : on === 'warn' ? 'warn' : 'off';
    p.textContent = texto;
  }

  // ---------- Comandos ----------
  const FIJOS = ['AVANZAR', 'RETROCEDER', 'GIRAR_IZQUIERDA', 'GIRAR_DERECHA', 'DETENER', 'SUBIR_BRAZO', 'BAJAR_BRAZO', 'ABRIR_PALA', 'CERRAR_PALA'];
  function pintarComandos(lista) {
    estado.comandos = new Map(lista.map(c => [c.nombre, c]));
    document.querySelectorAll('.tablero [data-cmd]').forEach(b => {
      const c = estado.comandos.get(b.dataset.cmd);
      b.disabled = !c || !c.activo;
      b.title = c ? `${bonito(c.nombre)} · código ${c.codigo}${c.activo ? '' : ' (inactivo)'}` : 'Este vehículo no tiene ese comando';
    });
    const extras = lista.filter(c => !FIJOS.includes(c.nombre));
    $('#extras').hidden = !extras.length;
    $('#extras-lista').innerHTML = extras.map(c =>
      `<button type="button" class="tecla chica" data-cmd="${esc(c.nombre)}" ${c.activo ? '' : 'disabled'}>${esc(bonito(c.nombre))}</button>`).join('');
  }

  async function enviar(nombre, boton) {
    const c = estado.comandos.get(nombre);
    if (!c) return;
    if (!clave()) { abrirAjustes(); return; }
    boton?.classList.add('pulsada');
    try {
      const r = await postClave(`/vehiculos/${estado.idV}/movimientos`, { id_comando: c.id_comando, origen: origen() });
      pintarEstado(r.estado);
      marcar(boton, 'ok');
      if (!estado.ws || estado.ws.readyState !== 1) cargarHistorial();
    } catch (e) {
      marcar(boton, 'error');
      if (e.status === 401 || e.status === 403) { aviso('La clave de acceso no es válida. Revísala en Ajustes.', true); abrirAjustes(); }
      else aviso(e.message, true);
    } finally {
      boton?.classList.remove('pulsada');
    }
  }
  function marcar(b, clase) {
    if (!b) return;
    b.classList.add(clase); setTimeout(() => b.classList.remove(clase), 450);
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('.tablero [data-cmd]');
    if (b && !b.disabled) enviar(b.dataset.cmd, b);
  });
  const TECLAS = { ArrowUp: 'AVANZAR', ArrowDown: 'RETROCEDER', ArrowLeft: 'GIRAR_IZQUIERDA', ArrowRight: 'GIRAR_DERECHA', ' ': 'DETENER' };
  document.addEventListener('keydown', (ev) => {
    if (ev.repeat || ev.target.closest('input, select, textarea, dialog')) return;
    const nombre = TECLAS[ev.key];
    if (!nombre) return;
    ev.preventDefault();
    enviar(nombre, document.querySelector(`.cruceta [data-cmd="${nombre}"]`));
  });

  // ---------- Historial y eventos ----------
  async function cargarHistorial() {
    try {
      const h = await pedir(`/vehiculos/${estado.idV}/historial`);
      $('#tab-historial').innerHTML = h.movimientos.length
        ? h.movimientos.map(m => `<li><span class="num">#${m.id_historial}</span><span><span class="cmd">${esc(bonito(m.comando))}</span><span class="org">${esc(m.origen)}</span></span><time>${hora(m.fecha_hora)}</time></li>`).join('')
        : '<li class="vacio">Sin movimientos registrados todavía.</li>';
    } catch (e) { $('#tab-historial').innerHTML = `<li class="vacio">${esc(e.message)}</li>`; }
  }
  function registrarEvento(m) {
    const lista = $('#tab-eventos');
    const demo = m.evento.startsWith('demo');
    const mal = /error|cancel/.test(m.evento);
    const detalle = m.comando ? bonito(m.comando) + (m.duracion_ms ? ` · ${m.duracion_ms} ms + ${m.pausa_ms} ms` : '')
      : m.demo ? m.demo : m.detalle || '';
    lista.insertAdjacentHTML('afterbegin',
      `<li><span class="tipo ${demo ? 'demo' : ''} ${mal ? 'mal' : ''}">${esc(m.evento)}</span><span class="cmd">${esc(detalle)}</span><time>${hora(m.timestamp)}</time></li>`);
    while (lista.children.length > 60) lista.lastElementChild.remove();
  }
  document.querySelectorAll('.pestana').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.pestana').forEach(o => o.setAttribute('aria-selected', String(o === t)));
    $('#tab-historial').hidden = t.dataset.tab !== 'historial';
    $('#tab-eventos').hidden = t.dataset.tab !== 'eventos';
  }));

  // ---------- DEMO ----------
  async function pintarDemos() {
    const ul = $('#lista-demos');
    if (!estado.demos.length) { ul.innerHTML = '<li class="vacio">Este vehículo no tiene rutinas DEMO.</li>'; return; }
    await Promise.all(estado.demos.map(async d => {
      if (!estado.movsDemo.has(d.id_demo)) {
        try { estado.movsDemo.set(d.id_demo, await pedir(`/vehiculos/${estado.idV}/demos/${d.id_demo}/movimientos`)); }
        catch { estado.movsDemo.set(d.id_demo, []); }
      }
    }));
    ul.innerHTML = estado.demos.map(d => {
      const movs = estado.movsDemo.get(d.id_demo) || [];
      const ms = movs.reduce((s, m) => s + m.duracion_ms + m.pausa_ms, 0);
      return `<li class="demo">
        <strong>${esc(d.nombre)}</strong>
        ${d.descripcion ? `<p>${esc(d.descripcion)}</p>` : ''}
        <span class="meta">${movs.length} movimientos · ${(ms / 1000).toFixed(1)} s${d.activo ? '' : ' · inactiva'}</span>
        <button type="button" class="btn-primario" data-demo="${d.id_demo}" ${d.activo && movs.length && !estado.demoEnCurso ? '' : 'disabled'}>Iniciar</button>
      </li>`;
    }).join('');
  }
  $('#lista-demos').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-demo]');
    if (!b) return;
    if (!clave()) { abrirAjustes(); return; }
    b.disabled = true;
    try {
      await postClave(`/vehiculos/${estado.idV}/demos/${b.dataset.demo}/iniciar`);
    } catch (e) {
      aviso(e.message, true); b.disabled = false;
      if (e.status === 401 || e.status === 403) abrirAjustes();
    }
  });
  $('#btn-cancelar').addEventListener('click', async () => {
    try { await postClave(`/vehiculos/${estado.idV}/demos/cancelar`); }
    catch (e) { aviso(e.message, true); }
  });
  function demoEnMarcha(idDemo, nombre, total) {
    estado.demoEnCurso = idDemo;
    const movs = estado.movsDemo.get(idDemo) || [];
    $('#progreso').hidden = false; $('#btn-cancelar').hidden = false;
    $('#progreso-nombre').textContent = nombre;
    $('#progreso-num').textContent = `0 / ${total}`;
    $('#progreso-barra').style.width = '0';
    $('#pasos').innerHTML = movs.map(m => `<li data-orden="${m.orden}">${m.orden}. ${esc(bonito(m.comando))}</li>`).join('');
    pintarDemos();
  }
  function demoPaso(m) {
    if (estado.demoEnCurso !== m.id_demo) demoEnMarcha(m.id_demo, m.demo, m.total_movimientos);
    $('#progreso-num').textContent = `${m.numero} / ${m.total_movimientos}`;
    $('#progreso-barra').style.width = (m.numero / m.total_movimientos * 100) + '%';
    document.querySelectorAll('#pasos li').forEach(li => {
      const o = Number(li.dataset.orden);
      li.classList.toggle('actual', o === m.orden);
      li.classList.toggle('hecho', o < m.orden);
    });
  }
  function demoTermina() {
    estado.demoEnCurso = null;
    $('#progreso').hidden = true; $('#btn-cancelar').hidden = true;
    pintarDemos();
  }

  // ---------- WebSocket ----------
  function conectar() {
    if (estado.ws) { estado.ws.onclose = null; estado.ws.close(); }
    clearInterval(estado.ping);
    const url = API.replace(/^http/, 'ws') + `/ws/vehiculos/${estado.idV}`;
    pintarEnlace('warn', 'Conectando…');
    const ws = new WebSocket(url);
    estado.ws = ws;
    ws.onopen = () => {
      estado.reintento = 0;
      pintarEnlace(true, 'En línea');
      estado.ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000);
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.evento === 'pong') return;
      registrarEvento(m);
      switch (m.evento) {
        case 'estado_actual':
          pintarEstado(m);
          if (!m.demo_en_curso && estado.demoEnCurso) demoTermina();
          break;
        case 'movimiento':
          pintarEstado({ comando: m.comando, codigo: m.codigo, timestamp: m.timestamp });
          cargarHistorial();
          break;
        case 'demo_inicio':
          demoEnMarcha(m.id_demo, m.demo, m.total_movimientos);
          aviso(`DEMO "${m.demo}" en marcha`);
          break;
        case 'demo_movimiento':
          pintarEstado({ comando: m.comando, codigo: m.codigo, timestamp: m.timestamp });
          demoPaso(m);
          break;
        case 'demo_fin':
          demoTermina(); aviso('DEMO terminada · el historial no cambia');
          break;
        case 'demo_cancelada':
          demoTermina(); aviso('DEMO cancelada', true);
          break;
        case 'demo_error': case 'error':
          demoTermina(); aviso(m.detalle || 'Error en el vehículo', true);
          break;
      }
    };
    ws.onclose = () => {
      clearInterval(estado.ping);
      pintarEnlace(false, 'Sin enlace');
      const espera = Math.min(15000, 1000 * 2 ** estado.reintento++);
      setTimeout(() => { if (estado.ws === ws) conectar(); }, espera);
    };
  }

  // ---------- Vehículo ----------
  async function cargarVehiculo(id) {
    estado.idV = id; guardado('ctl.vehiculo', String(id));
    estado.movsDemo.clear(); estado.demoEnCurso = null;
    $('#progreso').hidden = true; $('#btn-cancelar').hidden = true;
    $('#tab-eventos').innerHTML = '';
    try {
      const d = await pedir(`/vehiculos/${id}/detalle`);
      $('#nombre-vehiculo').textContent = d.vehiculo.nombre;
      $('#modelo-vehiculo').textContent = [d.vehiculo.modelo, d.vehiculo.microcontrolador].filter(Boolean).join(' · ') || 'Vehículo IoT';
      document.title = `${d.vehiculo.nombre} · Control`;
      pintarComandos(d.comandos);
      pintarEstado(d.estado || { comando: null, codigo: null, conectado: false });
      estado.demos = d.demos;
      await pintarDemos();
      cargarHistorial();
      conectar();
    } catch (e) {
      aviso(e.message, true);
    }
  }
  $('#vehiculo').addEventListener('change', (e) => cargarVehiculo(Number(e.target.value)));

  async function iniciar() {
    try {
      const lista = await pedir('/vehiculos');
      if (!lista.length) { $('#nombre-vehiculo').textContent = 'Sin vehículos'; $('#modelo-vehiculo').textContent = 'Registra uno desde /docs'; return; }
      if (!lista.some(v => v.id_vehiculo === estado.idV)) estado.idV = lista[0].id_vehiculo;
      $('#vehiculo').innerHTML = lista.map(v => `<option value="${v.id_vehiculo}" ${v.id_vehiculo === estado.idV ? 'selected' : ''}>${esc(v.nombre)}${v.activo ? '' : ' (inactivo)'}</option>`).join('');
      await cargarVehiculo(estado.idV);
      if (!clave()) abrirAjustes();
    } catch (e) {
      $('#modelo-vehiculo').textContent = 'No se pudo contactar la API';
      aviso(e.message, true);
    }
  }

  // ---------- Ajustes ----------
  function abrirAjustes() {
    $('#api-key').value = clave();
    $('#origen').value = origen();
    const dlg = $('#ajustes');
    if (!dlg.open) dlg.showModal();
  }
  $('#btn-ajustes').addEventListener('click', abrirAjustes);
  $('#form-ajustes').addEventListener('submit', () => {
    guardado('ctl.apikey', $('#api-key').value.trim());
    guardado('ctl.origen', $('#origen').value.trim() || 'WEB-CONTROL');
    aviso('Acceso guardado');
  });

  iniciar();
})();
