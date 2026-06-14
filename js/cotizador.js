/* ============================================
   UP EQUIPOS - cotizador.js
   Modulo de cotizaciones para el asesor Liam.

   Flujo:
   1. Liam ofrece "Cotizar ahora" cuando detecta intencion de precio.
   2. Se renderiza un formulario-tarjeta dentro del chat.
   3. Al enviar, llama a la Edge Function up-cotizar (calcula el
      estimado en el servidor y guarda la cotizacion en Supabase).
   4. Muestra una tarjeta con el total estimado, boton de WhatsApp y
      enlace al PDF (print_cotizacion.html?id=...).
   ============================================ */

const UPCotizador = (() => {

  const money = v => '$ ' + Number(v || 0).toLocaleString('es-CO') + ' COP';

  const EQUIPOS = [
    { v: 'tijera_electrica', t: 'Tijera Eléctrica (interior)' },
    { v: 'tijera_diesel',    t: 'Tijera Diésel (exterior)' },
    { v: 'brazo_articulado', t: 'Brazo Articulado' },
    { v: 'telescopico',      t: 'Brazo Telescópico' },
    { v: 'telehandler',      t: 'Telehandler / Manipulador' },
    { v: 'camion_grua',      t: 'Camión Grúa' }
  ];

  function injectStyles() {
    if (document.getElementById('cotizador-styles')) return;
    const s = document.createElement('style');
    s.id = 'cotizador-styles';
    s.textContent = `
      .cotz-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;
        padding:14px 14px 16px;margin:6px 0;box-shadow:0 4px 16px rgba(0,0,0,.06)}
      .cotz-card h4{margin:0 0 10px;font-size:.95rem;color:#1a1a1a;font-weight:800}
      .cotz-row{margin-bottom:9px}
      .cotz-row label{display:block;font-size:.72rem;font-weight:700;text-transform:uppercase;
        letter-spacing:.5px;color:#9ca3af;margin-bottom:3px}
      .cotz-row input,.cotz-row select{width:100%;padding:8px 10px;border:1px solid #d1d5db;
        border-radius:8px;font-size:.9rem;font-family:inherit;background:#fff;color:#1a1a1a}
      .cotz-row input:focus,.cotz-row select:focus{outline:none;border-color:#C0001F}
      .cotz-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .cotz-submit{width:100%;margin-top:6px;padding:11px;border:none;border-radius:10px;
        background:#C0001F;color:#fff;font-weight:800;font-size:.92rem;cursor:pointer}
      .cotz-submit:disabled{opacity:.6;cursor:not-allowed}
      .cotz-submit:hover:not(:disabled){background:#a30019}
      .cotz-hint{font-size:.72rem;color:#9ca3af;margin-top:8px;line-height:1.4}
      .cotz-result .cotz-total{font-size:1.5rem;font-weight:900;color:#16a34a;margin:2px 0 2px}
      .cotz-result .cotz-nro{font-family:'Courier New',monospace;font-weight:800;color:#C0001F}
      .cotz-line{display:flex;justify-content:space-between;font-size:.85rem;color:#374151;
        padding:3px 0;border-bottom:1px dashed #eee}
      .cotz-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .cotz-btn{flex:1;min-width:130px;text-align:center;padding:10px;border-radius:10px;
        font-weight:700;font-size:.85rem;text-decoration:none;cursor:pointer;border:none}
      .cotz-btn.wa{background:#25D366;color:#fff}
      .cotz-btn.pdf{background:#1a1a1a;color:#fff}
      .cotz-btn:hover{opacity:.9}
      .cotz-disclaimer{font-size:.72rem;color:#9ca3af;margin-top:10px;line-height:1.4}
    `;
    document.head.appendChild(s);
  }

  function appendCard(node) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = '🔧';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.style.background = 'transparent';
    bubble.style.padding = '0';
    bubble.appendChild(node);
    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  // ---- Render del formulario de cotizacion ----
  function renderForm() {
    injectStyles();
    const card = document.createElement('div');
    card.className = 'cotz-card';
    card.innerHTML = `
      <h4>📋 Cotización rápida</h4>
      <div class="cotz-row">
        <label>Equipo</label>
        <select id="cotz-equipo">
          ${EQUIPOS.map(e => `<option value="${e.v}">${e.t}</option>`).join('')}
        </select>
      </div>
      <div class="cotz-2">
        <div class="cotz-row">
          <label>Altura (m)</label>
          <input id="cotz-altura" type="number" min="0" step="1" placeholder="Ej: 12">
        </div>
        <div class="cotz-row">
          <label>Días de alquiler</label>
          <input id="cotz-dias" type="number" min="1" step="1" placeholder="Ej: 5" value="1">
        </div>
      </div>
      <div class="cotz-2">
        <div class="cotz-row">
          <label>Ciudad</label>
          <select id="cotz-ciudad">
            <option>Medellín</option><option>Bogotá</option>
            <option>Barranquilla</option><option>Otra</option>
          </select>
        </div>
        <div class="cotz-row">
          <label>Tu nombre</label>
          <input id="cotz-nombre" type="text" placeholder="Nombre">
        </div>
      </div>
      <div class="cotz-2">
        <div class="cotz-row">
          <label>Teléfono / WhatsApp</label>
          <input id="cotz-tel" type="tel" placeholder="3001234567">
        </div>
        <div class="cotz-row">
          <label>Correo (opcional)</label>
          <input id="cotz-correo" type="email" placeholder="tu@correo.com">
        </div>
      </div>
      <button class="cotz-submit" id="cotz-go">Generar cotización</button>
      <div class="cotz-hint">Recibirás un valor estimado al instante. Un asesor confirmará disponibilidad y condiciones.</div>
    `;
    appendCard(card);

    const btn = card.querySelector('#cotz-go');
    btn.addEventListener('click', () => submit(card, btn));
  }

  async function submit(card, btn) {
    const get = id => card.querySelector(id)?.value?.trim() || '';
    const dias = parseInt(get('#cotz-dias')) || 0;
    const tel = get('#cotz-tel');

    if (dias < 1) { alert('Indica cuántos días necesitas el equipo.'); return; }
    if (!tel)     { alert('Déjanos un teléfono para enviarte la cotización.'); return; }

    btn.disabled = true;
    btn.textContent = 'Generando...';

    const params = new URLSearchParams(window.location.search);
    const payload = {
      tipo_equipo: get('#cotz-equipo'),
      subtipo: get('#cotz-equipo'),
      altura_m: get('#cotz-altura'),
      dias,
      ciudad: get('#cotz-ciudad'),
      nombre: get('#cotz-nombre'),
      telefono: tel,
      correo: get('#cotz-correo'),
      utm_source: params.get('utm_source') || '',
      utm_campaign: params.get('utm_campaign') || '',
      page_url: window.location.href
    };

    try {
      const res = await fetch(window.UP_CONFIG.cotizarUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.UP_CONFIG.anonKey}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error');
      card.remove();
      renderResult(data, payload);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Generar cotización';
      appendCard(textBubble('No pude generar la cotización en este momento. Escríbenos al WhatsApp y te ayudamos: ' + waLink('Hola, quiero una cotización', null)));
      console.error('[UPCotizador]', e);
    }
  }

  function waLink(text, _) {
    const num = window.UP_CONFIG.whatsappComercial;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

  function textBubble(html) {
    const d = document.createElement('div');
    d.className = 'cotz-card';
    d.innerHTML = html;
    return d;
  }

  function renderResult(data, payload) {
    injectStyles();
    const eqLabel = (EQUIPOS.find(e => e.v === payload.tipo_equipo) || {}).t || data.tipo;
    const printUrl = `print_cotizacion.html?id=${encodeURIComponent(data.id)}`;
    const waText =
      `Hola UP Equipos, generé la cotización ${data.nro} desde la web.\n` +
      `Equipo: ${eqLabel}\nDías: ${data.dias}\nCiudad: ${payload.ciudad}\n` +
      `Total estimado: ${money(data.total)}\nQuiero confirmar disponibilidad.`;

    const card = document.createElement('div');
    card.className = 'cotz-card cotz-result';
    card.innerHTML = `
      <h4>✅ Cotización <span class="cotz-nro">${data.nro}</span></h4>
      <div class="cotz-line"><span>Equipo</span><span>${eqLabel}</span></div>
      <div class="cotz-line"><span>Días</span><span>${data.dias}</span></div>
      <div class="cotz-line"><span>Tarifa estimada / día</span><span>${money(data.precio_dia)}</span></div>
      <div class="cotz-line"><span>Subtotal</span><span>${money(data.subtotal)}</span></div>
      <div class="cotz-line"><span>IVA (19%)</span><span>${money(data.iva)}</span></div>
      <div class="cotz-total">${money(data.total)}</div>
      <div class="cotz-actions">
        <a class="cotz-btn wa" href="${waLink(waText)}" target="_blank" rel="noopener">Confirmar por WhatsApp</a>
        <a class="cotz-btn pdf" href="${printUrl}" target="_blank" rel="noopener">Ver / Descargar PDF</a>
      </div>
      <div class="cotz-disclaimer">${data.nota || 'Valor estimado sujeto a confirmación del equipo comercial.'}</div>
    `;
    appendCard(card);
  }

  return { renderForm, renderResult };
})();
