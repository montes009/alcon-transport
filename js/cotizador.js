/* ============================================
   UP EQUIPOS - cotizador.js
   Cotización guiada y conversacional con Liam.

   Flujo:
   1. El usuario pide una cotización -> Liam inicia la captura.
   2. Liam pregunta paso a paso (equipo, días, ciudad, nombre, teléfono).
   3. Al completar, llama a la Edge Function up-cotizar (guarda en
      cotizaciones_web, AISLADA del ERP) y entrega un ID/N° de cotización.
   4. Aparece un botón fijo abajo del chat: "Generando..." (rojo) ->
      "✓ Descargar cotización" (verde) que abre/descarga el PDF desde Supabase.
   ============================================ */

const UPCotizador = (() => {

  const money = v => '$ ' + Number(v || 0).toLocaleString('es-CO') + ' COP';

  let tarifasCache = null;
  let active = false;
  let step = null;            // equipo | dias | ciudad | nombre | telefono | done
  let data = {};
  let lastResult = null;

  // ---------- utilidades de render ----------
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
      .cotz-card .cotz-nro{font-family:'Courier New',monospace;font-weight:800;color:#C0001F}
      .cotz-total{font-size:1.4rem;font-weight:900;color:#16a34a;margin:4px 0}
      .cotz-line{display:flex;justify-content:space-between;gap:10px;font-size:.85rem;color:#374151;
        padding:3px 0;border-bottom:1px dashed #eee}
      .cotz-obs{margin-top:10px;background:#fff8f0;border:1px solid #f3d9c0;border-radius:8px;
        padding:10px 12px;font-size:.72rem;color:#7a5b2e;line-height:1.5;white-space:pre-line}
      /* barra inferior fija */
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
    widget.appendChild(bar); // queda al fondo del chat
    return bar;
  }

  function setBottomGenerating() {
    injectStyles();
    const bar = bottomBar();
    if (!bar) return;
    bar.style.display = '';
    bar.innerHTML = `<button class="cotz-dlbtn gen" disabled>⏳ Generando cotización...</button>`;
  }

  function setBottomReady(result) {
    const bar = bottomBar();
    if (!bar) return;
    const url = `print_cotizacion.html?id=${encodeURIComponent(result.id)}&print=1`;
    bar.style.display = '';
    bar.innerHTML =
      `<a class="cotz-dlbtn ready" href="${url}" target="_blank" rel="noopener">⬇ Descargar cotización</a>` +
      `<span class="cotz-ref">Cotización <b>${result.nro}</b> · guarda este número para consultarla luego</span>`;
  }

  function setBottomError() {
    const bar = bottomBar();
    if (!bar) return;
    bar.style.display = '';
    bar.innerHTML = `<button class="cotz-dlbtn err" onclick="UPCotizador.start(true)">↻ Reintentar cotización</button>`;
  }

  // ---------- carga de catálogo ----------
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

  // ---------- flujo conversacional ----------
  async function start(restart) {
    if (active && !restart) return;
    active = true;
    step = 'equipo';
    data = {};
    lastResult = null;
    injectStyles();
    const bar = document.getElementById('cotz-bottombar');
    if (bar) bar.style.display = 'none';

    renderBubble('¡Perfecto! Te armo la cotización en un momento. 📋');
    await askEquipo();
  }

  async function askEquipo() {
    step = 'equipo';
    let tarifas = [];
    try { tarifas = await loadTarifas(); } catch (e) { console.error('[UPCotizador] tarifas', e); }
    renderBubble('¿Qué equipo necesitas? Toca una opción:');
    const cont = document.createElement('div');
    cont.className = 'cotz-chips';
    (tarifas || []).forEach(t => {
      const chip = document.createElement('button');
      chip.className = 'cotz-chip';
      chip.textContent = `${t.ref} · ${t.tipo} ${t.altura_m}m`;
      chip.addEventListener('click', () => {
        data.tarifa_id = t.id;
        data.tarifaLabel = `${t.ref} · ${t.tipo} ${t.altura_m}m (${t.descripcion})`;
        cont.querySelectorAll('button').forEach(b => b.disabled = true);
        echoUser(`${t.ref} (${t.altura_m}m)`);
        askDias();
      });
      cont.appendChild(chip);
    });
    appendNode(cont);
  }

  function askDias() {
    step = 'dias';
    renderBubble('¿Por cuántos días necesitas el equipo?');
  }
  function askCiudad() {
    step = 'ciudad';
    renderBubble('¿En qué ciudad será el trabajo? (Barranquilla, Medellín, Bogotá u otra)');
  }
  function askNombre() {
    step = 'nombre';
    renderBubble('¿A nombre de quién hago la cotización?');
  }
  function askTelefono() {
    step = 'telefono';
    renderBubble('Por último, ¿a qué teléfono / WhatsApp te enviamos la confirmación?');
  }

  // Recibe las respuestas escritas por el usuario en el chat
  function handleAnswer(text) {
    const t = (text || '').trim();
    if (!active) return;

    switch (step) {
      case 'equipo':
        renderBubble('Por favor toca uno de los botones de equipo de arriba 👆');
        break;
      case 'dias': {
        const dias = parseInt(t.replace(/\D/g, ''));
        if (!dias || dias < 1) { renderBubble('Dime un número de días, por ejemplo: 5'); return; }
        data.dias = dias;
        askCiudad();
        break;
      }
      case 'ciudad':
        data.ciudad = t || 'No especificada';
        askNombre();
        break;
      case 'nombre':
        data.nombre = t;
        askTelefono();
        break;
      case 'telefono': {
        const tel = t.replace(/[^\d+]/g, '');
        if (tel.length < 7) { renderBubble('Ese teléfono parece incompleto. Escríbelo de nuevo, por favor.'); return; }
        data.telefono = tel;
        finish();
        break;
      }
    }
  }

  async function finish() {
    step = 'done';
    renderBubble(`Gracias ${data.nombre || ''}. Estoy generando tu cotización... ⏳`);
    setBottomGenerating();

    const params = new URLSearchParams(window.location.search);
    const payload = {
      tarifa_id: data.tarifa_id,
      dias: data.dias,
      ciudad: data.ciudad,
      nombre: data.nombre,
      telefono: data.telefono,
      utm_source: params.get('utm_source') || '',
      utm_campaign: params.get('utm_campaign') || '',
      page_url: window.location.href
    };

    try {
      const res = await fetch(window.UP_CONFIG.cotizarUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.UP_CONFIG.anonKey}` },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || 'Error');

      lastResult = result;
      active = false;
      renderBubble(
        `✅ ¡Listo! Tu cotización es ${result.nro}.\n` +
        `Equipo: ${result.tipo}\nDías: ${result.dias} (${result.tramo})\n` +
        `Total estimado: ${money(result.total)} (IVA incluido).\n\n` +
        `📌 Guarda tu número ${result.nro}: con él puedes volver a consultarla cuando quieras.\n` +
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
    const card = document.createElement('div');
    card.className = 'cotz-card';
    card.innerHTML = `
      <div>Cotización <span class="cotz-nro">${result.nro}</span></div>
      <div class="cotz-line"><span>Equipo</span><span style="text-align:right">${result.tipo}</span></div>
      <div class="cotz-line"><span>Días (${result.tramo})</span><span>${result.dias}</span></div>
      <div class="cotz-line"><span>Tarifa / día</span><span>${money(result.precio_dia)}</span></div>
      <div class="cotz-line"><span>Subtotal</span><span>${money(result.subtotal)}</span></div>
      <div class="cotz-line"><span>IVA (19%)</span><span>${money(result.iva)}</span></div>
      <div class="cotz-total">${money(result.total)}</div>
      ${result.observaciones ? `<div class="cotz-obs"><strong>Observaciones:</strong>\n${result.observaciones}</div>` : ''}
    `;
    appendNode(card);
  }

  return {
    start,
    handleAnswer,
    get active() { return active; }
  };
})();
