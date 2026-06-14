/* ============================================
   UP EQUIPOS - cotizador.js
   Modulo de cotizaciones del asesor Liam.

   - Carga el catalogo real desde la tabla tarifas_web (TARIFAS 2).
   - Llama a la Edge Function up-cotizar (calcula por tramo de dias + IVA,
     guarda en cotizaciones_web, AISLADA del ERP Alcon OPS).
   - Muestra tarjeta con total, observaciones, WhatsApp y enlace al PDF.
   ============================================ */

const UPCotizador = (() => {

  const money = v => '$ ' + Number(v || 0).toLocaleString('es-CO') + ' COP';
  let tarifasCache = null;

  async function loadTarifas() {
    if (tarifasCache) return tarifasCache;
    const url = `${window.UP_CONFIG.supabaseUrl}/rest/v1/tarifas_web` +
      `?select=id,ref,tipo,descripcion,altura_m&activo=eq.true&order=orden`;
    const res = await fetch(url, {
      headers: {
        'apikey': window.UP_CONFIG.anonKey,
        'Authorization': `Bearer ${window.UP_CONFIG.anonKey}`
      }
    });
    tarifasCache = await res.json();
    return tarifasCache;
  }

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
      .cotz-result .cotz-total{font-size:1.5rem;font-weight:900;color:#16a34a;margin:2px 0}
      .cotz-result .cotz-nro{font-family:'Courier New',monospace;font-weight:800;color:#C0001F}
      .cotz-line{display:flex;justify-content:space-between;font-size:.85rem;color:#374151;
        padding:3px 0;border-bottom:1px dashed #eee}
      .cotz-obs{margin-top:10px;background:#fff8f0;border:1px solid #f3d9c0;border-radius:8px;
        padding:10px 12px;font-size:.72rem;color:#7a5b2e;line-height:1.5;white-space:pre-line}
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

  async function renderForm() {
    injectStyles();
    let tarifas = [];
    try { tarifas = await loadTarifas(); } catch (e) { console.error('[UPCotizador] tarifas', e); }

    const opts = (tarifas || []).map(t =>
      `<option value="${t.id}">${t.ref} · ${t.tipo} ${t.altura_m}m (${t.descripcion})</option>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'cotz-card';
    card.innerHTML = `
      <h4>📋 Cotización rápida</h4>
      <div class="cotz-row">
        <label>Equipo</label>
        <select id="cotz-equipo">${opts || '<option value="">No se pudo cargar el catálogo</option>'}</select>
      </div>
      <div class="cotz-2">
        <div class="cotz-row">
          <label>Días de alquiler</label>
          <input id="cotz-dias" type="number" min="1" step="1" placeholder="Ej: 5" value="1">
        </div>
        <div class="cotz-row">
          <label>Ciudad</label>
          <select id="cotz-ciudad">
            <option>Barranquilla</option><option>Medellín</option>
            <option>Bogotá</option><option>Otra</option>
          </select>
        </div>
      </div>
      <div class="cotz-2">
        <div class="cotz-row">
          <label>Tu nombre</label>
          <input id="cotz-nombre" type="text" placeholder="Nombre">
        </div>
        <div class="cotz-row">
          <label>Teléfono / WhatsApp</label>
          <input id="cotz-tel" type="tel" placeholder="3001234567">
        </div>
      </div>
      <div class="cotz-row">
        <label>Correo (opcional)</label>
        <input id="cotz-correo" type="email" placeholder="tu@correo.com">
      </div>
      <button class="cotz-submit" id="cotz-go">Generar cotización</button>
      <div class="cotz-hint">El valor se calcula por tramo de días (tarifa + IVA). Un asesor confirma disponibilidad y condiciones.</div>
    `;
    appendCard(card);
    card.querySelector('#cotz-go').addEventListener('click', () => submit(card));
  }

  async function submit(card) {
    const btn = card.querySelector('#cotz-go');
    const get = id => card.querySelector(id)?.value?.trim() || '';
    const dias = parseInt(get('#cotz-dias')) || 0;
    const tel = get('#cotz-tel');
    const tarifaId = get('#cotz-equipo');

    if (!tarifaId) { alert('Selecciona un equipo.'); return; }
    if (dias < 1)  { alert('Indica cuántos días necesitas el equipo.'); return; }
    if (!tel)      { alert('Déjanos un teléfono para enviarte la cotización.'); return; }

    btn.disabled = true;
    btn.textContent = 'Generando...';

    const params = new URLSearchParams(window.location.search);
    const payload = {
      tarifa_id: tarifaId,
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
      appendCard(textBubble('No pude generar la cotización en este momento. Escríbenos al WhatsApp y te ayudamos: ' + waLink('Hola, quiero una cotización')));
      console.error('[UPCotizador]', e);
    }
  }

  function waLink(text) {
    return `https://wa.me/${window.UP_CONFIG.whatsappComercial}?text=${encodeURIComponent(text)}`;
  }
  function textBubble(html) {
    const d = document.createElement('div');
    d.className = 'cotz-card';
    d.innerHTML = html;
    return d;
  }

  function renderResult(data, payload) {
    injectStyles();
    const printUrl = `print_cotizacion.html?id=${encodeURIComponent(data.id)}`;
    const waText =
      `Hola UP Equipos, generé la cotización ${data.nro} desde la web.\n` +
      `Equipo: ${data.tipo}\nDías: ${data.dias} (${data.tramo})\nCiudad: ${payload.ciudad}\n` +
      `Total estimado: ${money(data.total)}\nQuiero confirmar disponibilidad.`;

    const card = document.createElement('div');
    card.className = 'cotz-card cotz-result';
    card.innerHTML = `
      <h4>✅ Cotización <span class="cotz-nro">${data.nro}</span></h4>
      <div class="cotz-line"><span>Equipo</span><span style="text-align:right">${data.tipo}</span></div>
      <div class="cotz-line"><span>Días (${data.tramo})</span><span>${data.dias}</span></div>
      <div class="cotz-line"><span>Tarifa / día</span><span>${money(data.precio_dia)}</span></div>
      <div class="cotz-line"><span>Subtotal</span><span>${money(data.subtotal)}</span></div>
      <div class="cotz-line"><span>IVA (19%)</span><span>${money(data.iva)}</span></div>
      <div class="cotz-total">${money(data.total)}</div>
      ${data.observaciones ? `<div class="cotz-obs"><strong>Observaciones:</strong>\n${data.observaciones}</div>` : ''}
      <div class="cotz-actions">
        <a class="cotz-btn wa" href="${waLink(waText)}" target="_blank" rel="noopener">Confirmar por WhatsApp</a>
        <a class="cotz-btn pdf" href="${printUrl}" target="_blank" rel="noopener">Ver / Descargar PDF</a>
      </div>
      <div class="cotz-disclaimer">${data.nota || 'Valor estimado + IVA, sujeto a confirmación del equipo comercial.'}</div>
    `;
    appendCard(card);
  }

  return { renderForm, renderResult };
})();
