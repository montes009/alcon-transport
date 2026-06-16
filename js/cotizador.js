/* ============================================
   UP EQUIPOS - cotizador.js
   Cotización guiada con Liam.

   Flujo:
   1. El usuario pide una cotización -> Liam inicia el proceso.
   2. PRIMERO: formulario para CREAR EL CLIENTE (se guarda en clientes_web
      vía up-cliente, antes de cotizar; queda como lead aunque no termine).
   3. Luego: elegir equipo (botones) y días.
   4. Genera la cotización (up-cotizar -> cotizaciones_web, AISLADA del ERP),
      entrega N° de cotización y muestra el botón fijo de descarga (PDF).
   ============================================ */

const UPCotizador = (() => {

  const money = v => '$ ' + Number(v || 0).toLocaleString('es-CO') + ' COP';

  let tarifasCache = null;
  let active = false;
  let step = null;            // form | equipo | dias | done
  let data = {};

  // ---------- render ----------
  function renderBubble(text) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    wrap.innerHTML = '<div class="msg-avatar">🔧</div>';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function echoUser(text) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    const wrap = document.createElement('div');
    wrap.className = 'msg user';
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = '👤';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function appendNode(node) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    wrap.innerHTML = '<div class="msg-avatar">🔧</div>';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.style.background = 'transparent';
    bubble.style.padding = '0';
    bubble.appendChild(node);
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  // ---------- estilos + barra inferior ----------
  function injectStyles() {
    if (document.getElementById('cotizador-styles')) return;
    const s = document.createElement('style');
    s.id = 'cotizador-styles';
    s.textContent = `
      .cotz-chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0}
      .cotz-chip{padding:8px 12px;border:1px solid #C0001F;background:#fff;color:#C0001F;
        border-radius:18px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit}
      .cotz-chip:hover{background:#C0001F;color:#fff}
      .cotz-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;
        box-shadow:0 4px 16px rgba(0,0,0,.06)}
      .cotz-card h4{margin:0 0 10px;font-size:.92rem;color:#1a1a1a;font-weight:800}
      .cotz-frow{margin-bottom:9px}
      .cotz-frow label{display:block;font-size:.72rem;font-weight:700;text-transform:uppercase;
        letter-spacing:.5px;color:#9ca3af;margin-bottom:3px}
      .cotz-frow input,.cotz-frow select{width:100%;padding:9px 10px;border:1px solid #d1d5db;
        border-radius:8px;font-size:.9rem;font-family:inherit;background:#fff;color:#1a1a1a}
      .cotz-frow input:focus,.cotz-frow select:focus{outline:none;border-color:#C0001F}
      .cotz-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .cotz-submit{width:100%;margin-top:6px;padding:11px;border:none;border-radius:10px;
        background:#C0001F;color:#fff;font-weight:800;font-size:.9rem;cursor:pointer}
      .cotz-submit:disabled{opacity:.6;cursor:not-allowed}
      .cotz-submit:hover:not(:disabled){background:#a30019}
      .cotz-card .cotz-nro{font-family:'Courier New',monospace;font-weight:800;color:#C0001F}
      .cotz-total{font-size:1.4rem;font-weight:900;color:#16a34a;margin:4px 0}
      .cotz-line{display:flex;justify-content:space-between;gap:10px;font-size:.85rem;color:#374151;
        padding:3px 0;border-bottom:1px dashed #eee}
      .cotz-obs{margin-top:10px;background:#fff8f0;border:1px solid #f3d9c0;border-radius:8px;
        padding:10px 12px;font-size:.72rem;color:#7a5b2e;line-height:1.5;white-space:pre-line}
      #cotz-bottombar{padding:10px 12px;border-top:1px solid #eee;background:#fafafa}
      #cotz-bottombar .cotz-dlbtn{display:flex;align-items:center;justify-content:center;gap:8px;
        width:100%;padding:12px;border:none;border-radius:12px;font-weight:800;font-size:.92rem;
        cursor:pointer;text-decoration:none;color:#fff;transition:background .3s,opacity .3s}
      .cotz-dlbtn.gen{background:#9ca3af;cursor:wait}
      .cotz-dlbtn.ready{background:#16a34a}
      .cotz-dlbtn.ready:hover{background:#128a3a}
      .cotz-dlbtn.err{background:#C0001F}
      #cotz-bottombar .cotz-ref{display:block;text-align:center;font-size:.72rem;color:#6b7280;margin-top:6px}
      #cotz-bottombar .cotz-ref b{color:#C0001F;font-family:'Courier New',monospace}
    `;
    document.head.appendChild(s);
  }

  function bottomBar() {
    let bar = document.getElementById('cotz-bottombar');
    if (bar) return bar;
    const widget = document.querySelector('.chat-widget');
    if (!widget) return null;
    bar = document.createElement('div');
    bar.id = 'cotz-bottombar';
    bar.style.display = 'none';
    widget.appendChild(bar);
    return bar;
  }
  function setBottomGenerating() {
    injectStyles();
    const bar = bottomBar(); if (!bar) return;
    bar.style.display = '';
    bar.innerHTML = `<button class="cotz-dlbtn gen" disabled>⏳ Generando cotización...</button>`;
  }
  function setBottomReady(result) {
    const bar = bottomBar(); if (!bar) return;
    const url = `print_cotizacion.html?id=${encodeURIComponent(result.id)}&print=1`;
    bar.style.display = '';
    bar.innerHTML =
      `<a class="cotz-dlbtn ready" href="${url}" target="_blank" rel="noopener">⬇ Descargar cotización</a>` +
      `<span class="cotz-ref">Cotización <b>${result.nro}</b> · guarda este número para consultarla luego</span>`;
  }
  function setBottomError() {
    const bar = bottomBar(); if (!bar) return;
    bar.style.display = '';
    bar.innerHTML = `<button class="cotz-dlbtn err" onclick="UPCotizador.start(true)">↻ Reintentar</button>`;
  }

  // ---------- catálogo ----------
  async function loadTarifas() {
    if (tarifasCache) return tarifasCache;
    const url = `${window.UP_CONFIG.supabaseUrl}/rest/v1/tarifas_web` +
      `?select=id,ref,tipo,descripcion,altura_m&activo=eq.true&order=orden`;
    const res = await fetch(url, {
      headers: { 'apikey': window.UP_CONFIG.anonKey, 'Authorization': `Bearer ${window.UP_CONFIG.anonKey}` }
    });
    tarifasCache = await res.json();
    return tarifasCache;
  }

  // ---------- flujo ----------
  async function start(restart, contextText) {
    if (active && !restart) return;
    active = true;
    step = 'inicio';
    const prevContext = data.preContext;
    data = {};
    data.items = [];
    data.preContext = contextText || prevContext || '';
    injectStyles();
    const bar = document.getElementById('cotz-bottombar');
    if (bar) bar.style.display = 'none';

    // Si el cliente ya dijo en el chat si es cliente o no, no se lo preguntamos otra vez
    const raw = data.preContext || '';
    const ctx = raw.toLowerCase();
    const yaCliente = /\bya soy cliente|\bsoy cliente\b|ya estoy registrad|cliente recurrente|cliente de up|mi nit es|\bnit\b/.test(ctx);
    const nuevoCliente = /cliente nuevo|no soy cliente|primera vez|nunca he sido|no estoy registrad/.test(ctx);
    // ¿Dió un NIT o teléfono en el chat? (7 a 12 dígitos)
    const numMatch = raw.match(/\b(\d{7,12})\b/);
    const num = numMatch ? numMatch[1] : null;
    const numEsNit = /nit/i.test(raw);
    data.prefillNit = numEsNit ? (num || '') : '';
    data.prefillTel = (!numEsNit && num) ? num : '';

    if (nuevoCliente) {
      renderBubble('¡Bienvenido! Te registro en un momento. Completa estos datos 👇');
      renderClienteForm();
      return;
    }

    // Si dio un número (NIT/teléfono), intentamos identificarlo directo
    if (num) {
      renderBubble('Dame un segundo, te ubico con ese dato... 🔎');
      try {
        const out = await rpc('buscar_cliente_web', { p_telefono: num, p_nit: num });
        if (out && out.id) {
          data.cliente_web_id = out.id;
          data.nombre = out.nombre; data.telefono = out.telefono; data.correo = out.correo;
          data.ciudad = out.ciudad; data.empresa = out.empresa; data.nit = out.nit;
          renderBubble(`¡Listo ${out.nombre || ''}! Ya te tengo registrado. Vamos directo al equipo.`);
          if (!data.correo) { pedirCorreo(); } else { askEquipo(); }
          return;
        }
        // No encontrado: lo registramos rápido (prellenando lo que dio)
        renderBubble('No te encontré con ese dato, te registro rápido y seguimos 👇');
        renderClienteForm();
        return;
      } catch (e) { console.error('[UPCotizador] lookup auto', e); }
    }

    if (yaCliente) {
      renderBubble('¡Perfecto! Para ubicarte rápido, dime tu teléfono o NIT 👇');
      renderLookup();
      return;
    }

    renderBubble('¡Con gusto te armo la cotización! ¿Ya eres cliente de UP Equipos?');
    const cont = document.createElement('div');
    cont.className = 'cotz-chips';
    const nuevo = document.createElement('button');
    nuevo.className = 'cotz-chip';
    nuevo.textContent = '🆕 Soy cliente nuevo';
    nuevo.addEventListener('click', () => {
      cont.querySelectorAll('button').forEach(b => b.disabled = true);
      echoUser('Soy cliente nuevo');
      renderBubble('Perfecto, te registro rápido. Completa estos datos 👇');
      renderClienteForm();
    });
    const ya = document.createElement('button');
    ya.className = 'cotz-chip';
    ya.textContent = '✅ Ya soy cliente';
    ya.addEventListener('click', () => {
      cont.querySelectorAll('button').forEach(b => b.disabled = true);
      echoUser('Ya soy cliente');
      renderLookup();
    });
    cont.appendChild(nuevo);
    cont.appendChild(ya);
    appendNode(cont);
  }

  // 0) ATAJO: buscar cliente existente por teléfono o NIT
  function renderLookup() {
    step = 'lookup';
    const card = document.createElement('div');
    card.className = 'cotz-card';
    card.innerHTML = `
      <h4>✅ Identifícate</h4>
      <div class="cotz-frow">
        <label>Teléfono o NIT con el que estás registrado</label>
        <input id="lk-val" type="text" placeholder="Ej: 3001234567 o 900123456">
      </div>
      <button class="cotz-submit" id="lk-go">Continuar</button>
    `;
    appendNode(card);
    card.querySelector('#lk-go').addEventListener('click', () => submitLookup(card));
  }

  async function submitLookup(card) {
    const btn = card.querySelector('#lk-go');
    const val = (card.querySelector('#lk-val')?.value || '').trim();
    if (!val) { alert('Escribe tu teléfono o NIT.'); return; }
    btn.disabled = true;
    btn.textContent = 'Buscando...';
    try {
      const out = await rpc('buscar_cliente_web', { p_telefono: val, p_nit: val });
      if (out && out.id) {
        card.querySelectorAll('input,button').forEach(el => el.disabled = true);
        echoUser(val);
        data.cliente_web_id = out.id;
        data.nombre = out.nombre;
        data.telefono = out.telefono;
        data.correo = out.correo;
        data.ciudad = out.ciudad;
        data.empresa = out.empresa;
        data.nit = out.nit;
        renderBubble(`¡Hola de nuevo, ${out.nombre || 'cliente'}! 👋 Ya te tengo registrado. Vamos directo al equipo.`);
        if (!data.correo) { pedirCorreo(); } else { askEquipo(); }
      } else {
        btn.disabled = false;
        btn.textContent = 'Continuar';
        renderBubble('No te encontré con ese dato. Te registro rápido y seguimos 👇');
        card.querySelectorAll('input,button').forEach(el => el.disabled = true);
        renderClienteForm();
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Continuar';
      renderBubble('No pude verificar ahora. Te registro rápido y seguimos 👇');
      renderClienteForm();
      console.error('[UPCotizador] lookup', e);
    }
  }

  // Pedir el correo (opcional) cuando el cliente identificado no lo tiene
  function pedirCorreo() {
    step = 'correo';
    const card = document.createElement('div');
    card.className = 'cotz-card';
    card.innerHTML = `
      <h4>✉️ Tu correo (opcional)</h4>
      <div class="cotz-frow">
        <label>Para enviarte la cotización</label>
        <input id="co-val" type="email" placeholder="tu@correo.com">
      </div>
      <button class="cotz-submit" id="co-go">Continuar</button>
      <div style="text-align:center;margin-top:8px">
        <a id="co-skip" href="#" style="color:#9ca3af;font-size:.8rem">Omitir</a>
      </div>
    `;
    appendNode(card);
    const cont = async (correo) => {
      card.querySelectorAll('input,button,a').forEach(el => el.disabled = true);
      if (correo) {
        data.correo = correo;
        echoUser(correo);
        // Actualiza la ficha del cliente con el correo (dedup por tel/NIT)
        try {
          await rpc('crear_cliente_web', {
            p_nombre: data.nombre || 'Cliente', p_telefono: data.telefono || '',
            p_correo: correo, p_ciudad: data.ciudad || '', p_empresa: data.empresa || '', p_nit: data.nit || ''
          });
        } catch (e) { console.error('[UPCotizador] correo', e); }
      }
      askEquipo();
    };
    card.querySelector('#co-go').addEventListener('click', () => {
      const v = (card.querySelector('#co-val')?.value || '').trim();
      if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { alert('Ingresa un correo válido o toca Omitir.');
        card.querySelectorAll('input,button,a').forEach(el => el.disabled = false); return; }
      cont(v);
    });
    card.querySelector('#co-skip').addEventListener('click', (e) => { e.preventDefault(); cont(''); });
  }

  // Llamada genérica a una RPC de Supabase
  async function rpc(fn, body) {
    const res = await fetch(`${window.UP_CONFIG.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.UP_CONFIG.anonKey,
        'Authorization': `Bearer ${window.UP_CONFIG.anonKey}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.message) || 'Error');
    return data;
  }

  // 1) FORMULARIO DE CLIENTE
  function renderClienteForm() {
    step = 'form';
    const card = document.createElement('div');
    card.className = 'cotz-card';
    card.innerHTML = `
      <h4>👤 Crear cliente</h4>
      <div class="cotz-frow">
        <label>Nombre completo *</label>
        <input id="cl-nombre" type="text" placeholder="Tu nombre">
      </div>
      <div class="cotz-2">
        <div class="cotz-frow">
          <label>Teléfono / WhatsApp *</label>
          <input id="cl-tel" type="tel" placeholder="3001234567">
        </div>
        <div class="cotz-frow">
          <label>Ciudad</label>
          <select id="cl-ciudad">
            <option>Barranquilla</option><option>Medellín</option>
            <option>Bogotá</option><option>Otra</option>
          </select>
        </div>
      </div>
      <div class="cotz-frow">
        <label>Correo (opcional)</label>
        <input id="cl-correo" type="email" placeholder="tu@correo.com">
      </div>
      <div class="cotz-2">
        <div class="cotz-frow">
          <label>Empresa (opcional)</label>
          <input id="cl-empresa" type="text" placeholder="Nombre de la empresa">
        </div>
        <div class="cotz-frow">
          <label>NIT (opcional)</label>
          <input id="cl-nit" type="text" placeholder="900123456-7">
        </div>
      </div>
      <button class="cotz-submit" id="cl-go">Crear cliente y continuar</button>
    `;
    appendNode(card);
    // Prellenar NIT/teléfono si el cliente ya los dio en el chat
    if (data.prefillNit) { const e = card.querySelector('#cl-nit'); if (e) e.value = data.prefillNit; }
    if (data.prefillTel) { const e = card.querySelector('#cl-tel'); if (e) e.value = data.prefillTel; }
    card.querySelector('#cl-go').addEventListener('click', () => submitCliente(card));
  }

  async function submitCliente(card) {
    const btn = card.querySelector('#cl-go');
    const get = id => card.querySelector(id)?.value?.trim() || '';
    const nombre = get('#cl-nombre');
    const tel = get('#cl-tel');
    if (!nombre) { alert('El nombre es obligatorio.'); return; }
    if (tel.replace(/\D/g, '').length < 7) { alert('Ingresa un teléfono válido.'); return; }

    btn.disabled = true;
    btn.textContent = 'Creando cliente...';

    const correo = get('#cl-correo');
    const ciudad = get('#cl-ciudad');
    const empresa = get('#cl-empresa');
    const nit = get('#cl-nit');

    try {
      // Crea/actualiza el cliente vía RPC (dedup por teléfono O NIT, incluye NIT).
      const out = await rpc('crear_cliente_web', {
        p_nombre: nombre, p_telefono: tel, p_correo: correo,
        p_ciudad: ciudad, p_empresa: empresa, p_nit: nit
      });
      const clienteId = (out && out.id) || (typeof out === 'string' ? out : null);
      if (!clienteId) throw new Error('Sin id de cliente');

      data.cliente_web_id = clienteId;
      data.nombre = nombre;
      data.telefono = tel;
      data.correo = correo;
      data.ciudad = ciudad;
      data.empresa = empresa;
      data.nit = nit;

      card.querySelectorAll('input,select,button').forEach(el => el.disabled = true);
      echoUser(`${nombre} · ${tel}`);
      renderBubble((out && out.creado === false)
        ? '✅ ¡Ya estabas registrado! Actualicé tus datos. Ahora elige el equipo.'
        : '✅ ¡Cliente registrado! Ahora elige el equipo.');
      askEquipo();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Crear cliente y continuar';
      renderBubble('No pude registrar el cliente. Revisa los datos e inténtalo de nuevo.');
      console.error('[UPCotizador] cliente', e);
    }
  }

  // Detecta el equipo a partir de lo que ya se habló en el chat
  function matchTarifa(text, tarifas) {
    const t = (text || '').toLowerCase();
    if (!t || !tarifas || !tarifas.length) return null;
    // 1) por referencia/modelo explícito (ej: "3246", "z45", "awp40"), con límites
    //    para no confundirse con números de teléfono o NIT.
    for (const tf of tarifas) {
      const token = String(tf.ref).toLowerCase().replace('genie', '').replace(/\s+/g, '');
      if (token && token.length >= 3) {
        const re = new RegExp('(^|[^a-z0-9])' + token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '([^a-z0-9]|$)');
        if (re.test(t.replace(/-/g, ''))) return tf;
      }
    }
    // 2) por tipo + altura (lo más común: "tijera de 12 metros")
    let tipo = null;
    if (/unipersonal/.test(t)) tipo = 'unipersonal';
    else if (/tijera|scissor/.test(t)) tipo = 'tijera';
    else if (/brazo|articulad|telesc|boom/.test(t)) tipo = 'brazo';
    const hm = t.match(/(\d{1,2})\s*(m\b|mts|mt\b|metro)/);
    const h = hm ? parseInt(hm[1]) : null;
    if (tipo && h) {
      const cands = tarifas.filter(x => x.tipo === tipo);
      if (cands.length) {
        const ge = cands.filter(x => Number(x.altura_m) >= h).sort((a, b) => a.altura_m - b.altura_m);
        return ge[0] || cands.sort((a, b) => b.altura_m - a.altura_m)[0];
      }
    }
    // 3) solo tipo (sin altura clara): elige el de menor altura de ese tipo como punto de partida
    if (tipo) {
      const cands = tarifas.filter(x => x.tipo === tipo).sort((a, b) => a.altura_m - b.altura_m);
      if (cands.length) return cands[0];
    }
    return null;
  }

  function elegirTarifa(t) {
    data.current = { tarifa_id: t.id, ref: t.ref, tipo: t.tipo, altura_m: t.altura_m, descripcion: t.descripcion };
    askCantidad();
  }

  // Cantidad de unidades de este equipo
  function askCantidad() {
    step = 'cantidad';
    renderBubble(`¿Cuántas unidades de ${data.current.ref} necesitas? (escribe un número, ej: 1)`);
  }

  function showEquipoChips(tarifas, titulo) {
    step = 'equipo';
    renderBubble(titulo || '¿Qué equipo necesitas? Toca una opción:');
    const cont = document.createElement('div');
    cont.className = 'cotz-chips';
    (tarifas || []).forEach(t => {
      const chip = document.createElement('button');
      chip.className = 'cotz-chip';
      chip.textContent = `${t.ref} · ${t.tipo} ${t.altura_m}m`;
      chip.addEventListener('click', () => {
        cont.querySelectorAll('button').forEach(b => b.disabled = true);
        echoUser(`${t.ref} (${t.altura_m}m)`);
        elegirTarifa(t);
      });
      cont.appendChild(chip);
    });
    appendNode(cont);
  }

  // 2) EQUIPO
  async function askEquipo() {
    step = 'equipo';
    let tarifas = [];
    try { tarifas = await loadTarifas(); } catch (e) { console.error('[UPCotizador] tarifas', e); }

    // Si en el chat ya se habló del equipo, lo confirmamos (no preguntar de nuevo)
    const pre = data.preContext ? matchTarifa(data.preContext, tarifas) : null;
    if (pre) {
      step = 'equipo';
      renderBubble(`Según lo que conversamos, te sirve la ${pre.ref} (${pre.tipo} ${pre.altura_m}m). ¿La uso para tu cotización?`);
      const cont = document.createElement('div');
      cont.className = 'cotz-chips';
      const si = document.createElement('button');
      si.className = 'cotz-chip';
      si.textContent = `✅ Sí, la ${pre.ref}`;
      si.addEventListener('click', () => {
        cont.querySelectorAll('button').forEach(b => b.disabled = true);
        echoUser(`Sí, la ${pre.ref}`);
        elegirTarifa(pre);
      });
      const otra = document.createElement('button');
      otra.className = 'cotz-chip';
      otra.textContent = '🔁 Elegir otra';
      otra.addEventListener('click', () => {
        cont.querySelectorAll('button').forEach(b => b.disabled = true);
        echoUser('Elegir otra');
        showEquipoChips(tarifas);
      });
      cont.appendChild(si);
      cont.appendChild(otra);
      appendNode(cont);
      return;
    }

    showEquipoChips(tarifas);
  }

  // 3) DÍAS (escrito)
  function askDias() {
    step = 'dias';
    renderBubble(`¿Por cuántos días necesitas ${data.current.ref}?`);
  }

  // Agrega el equipo actual a la lista y pregunta si quiere otro
  function addItemYAskMas() {
    data.items = data.items || [];
    data.items.push({ ...data.current });
    const last = data.items[data.items.length - 1];
    echoUser(`${last.cantidad} × ${last.ref} · ${last.dias} días`);

    step = 'mas';
    renderBubble('¿Deseas agregar otro equipo a esta misma cotización?');
    const cont = document.createElement('div');
    cont.className = 'cotz-chips';
    const otro = document.createElement('button');
    otro.className = 'cotz-chip';
    otro.textContent = '➕ Sí, otro equipo';
    otro.addEventListener('click', async () => {
      cont.querySelectorAll('button').forEach(b => b.disabled = true);
      echoUser('Agregar otro equipo');
      let tarifas = [];
      try { tarifas = await loadTarifas(); } catch (e) {}
      showEquipoChips(tarifas, '¿Qué otro equipo agregamos?');
    });
    const fin = document.createElement('button');
    fin.className = 'cotz-chip';
    fin.textContent = '✅ Generar cotización';
    fin.addEventListener('click', () => {
      cont.querySelectorAll('button').forEach(b => b.disabled = true);
      echoUser('Generar cotización');
      finish();
    });
    cont.appendChild(otro);
    cont.appendChild(fin);
    appendNode(cont);
  }

  function handleAnswer(text) {
    const t = (text || '').trim();
    if (!active) return;
    if (step === 'inicio') { renderBubble('Elige una opción de arriba: nuevo o ya soy cliente 👆'); return; }
    if (step === 'lookup') { renderBubble('Escribe tu teléfono o NIT en el campo de arriba y toca Continuar 👆'); return; }
    if (step === 'correo') { renderBubble('Escribe tu correo en el campo de arriba (o toca Omitir) 👆'); return; }
    if (step === 'form') { renderBubble('Completa el formulario de arriba para crear el cliente 👆'); return; }
    if (step === 'equipo') { renderBubble('Toca uno de los botones de equipo de arriba 👆'); return; }
    if (step === 'mas') { renderBubble('Toca una opción de arriba: agregar otro o generar 👆'); return; }
    if (step === 'cantidad') {
      const cant = parseInt(t.replace(/\D/g, ''));
      if (!cant || cant < 1) { renderBubble('Dime cuántas unidades, por ejemplo: 1'); return; }
      data.current.cantidad = cant;
      askDias();
      return;
    }
    if (step === 'dias') {
      const dias = parseInt(t.replace(/\D/g, ''));
      if (!dias || dias < 1) { renderBubble('Dime un número de días, por ejemplo: 5'); return; }
      data.current.dias = dias;
      addItemYAskMas();
    }
  }

  // 4) GENERAR (cotización con uno o varios equipos vía RPC cotizar_web)
  async function finish() {
    step = 'done';
    if (!data.items || !data.items.length) { renderBubble('No agregaste ningún equipo.'); return; }
    renderBubble(`Listo ${data.nombre || ''}, estoy generando tu cotización... ⏳`);
    setBottomGenerating();

    const items = data.items.map(i => ({ tarifa_id: i.tarifa_id, cantidad: i.cantidad || 1, dias: i.dias }));

    try {
      const result = await rpc('cotizar_web', {
        p_cliente_web_id: data.cliente_web_id,
        p_items: items,
        p_ciudad: data.ciudad || null,
        p_mensaje: null
      });
      if (!result || !result.ok) throw new Error((result && result.error) || 'Error');

      active = false;
      const resumen = (result.items || []).map(it =>
        `• ${it.cantidad} × ${it.ref} (${it.tipo} ${it.altura_m}m) · ${it.dias} días`).join('\n');
      renderBubble(
        `✅ ¡Listo! Tu cotización es ${result.nro}.\n${resumen}\n` +
        `Total estimado: ${money(result.total)} (IVA incluido).\n\n` +
        `📌 Guarda tu número ${result.nro}: con él puedes volver a consultarla.\n` +
        `Usa el botón verde de abajo para descargar tu cotización en PDF.`
      );
      renderResultCard(result);
      setBottomReady(result);
    } catch (e) {
      console.error('[UPCotizador]', e);
      renderBubble('Tuve un problema al generar la cotización. Toca "Reintentar" abajo o escríbenos por WhatsApp.');
      setBottomError();
      active = false;
    }
  }

  function renderResultCard(result) {
    injectStyles();
    const lineas = (result.items || []).map(it => `
      <div class="cotz-line"><span>${it.cantidad} × ${it.ref} (${it.altura_m}m) · ${it.dias}d</span>
      <span>${money(it.subtotal)}</span></div>`).join('');
    const card = document.createElement('div');
    card.className = 'cotz-card';
    card.innerHTML = `
      <div>Cotización <span class="cotz-nro">${result.nro}</span></div>
      ${lineas}
      <div class="cotz-line"><span>Subtotal</span><span>${money(result.subtotal)}</span></div>
      <div class="cotz-line"><span>IVA (19%)</span><span>${money(result.iva)}</span></div>
      <div class="cotz-total">${money(result.total)}</div>
    `;
    appendNode(card);
  }

  function isQuoteRequest(text) {
    return /cotiz|valor exacto|precio exacto|cot[ií]zame|me cotizas/i.test(text || '');
  }

  return {
    start,
    handleAnswer,
    isQuoteRequest,
    get active() { return active; }
  };
})();
