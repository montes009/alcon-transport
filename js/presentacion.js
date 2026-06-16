/* ============================================
   UP EQUIPOS - presentacion.js
   "Modo presentación": la página se explica/vende sola.
   - Globos flotantes (tour guiado) enfocados en Liam y sus alcances.
   - Tooltips al pasar el mouse sobre elementos clave.
   - Botón flotante para iniciar; auto-inicia con ?demo=1.
   No depende de backend ni altera el resto del sitio.
   ============================================ */
(function () {

  // ---------- Pasos del recorrido ----------
  const STEPS = [
    { sel: '.hero-content', title: '👋 Bienvenido a UP Equipos en línea',
      text: 'Esta página no es un folleto: <b>asesora, cotiza y capta clientes sola, 24/7</b>. Su título y textos están optimizados para <b>SEO</b> (aparecer en Google cuando buscan plataformas elevadoras).' },
    { sel: 'nav .nav-links, nav', title: '🧭 Navegación pensada para vender',
      text: 'Cada sección —Alquiler, Venta, Partes, Formación IPAF, Sedes— tiene <b>títulos optimizados para SEO</b> y guía al cliente a lo que busca en segundos.' },
    { sel: '.nav-cta', title: '⚡ Botón "Cotizar ahora" inteligente',
      text: 'Pensado para <b>no perder ningún cliente</b>:<br>• En <b>horario laboral</b> conecta directo con un <b>asesor humano</b>.<br>• <b>Fuera de horario</b>, lo atiende <b>Liam (IA)</b> que cotiza y captura el lead <b>24/7</b>.' },
    { sel: '.wa-float', title: '💬 WhatsApp siempre a la mano',
      text: 'Botón flotante de <b>WhatsApp directo</b> al comercial. El cliente puede escribir cuando quiera y la conversación queda registrada como lead.' },
    { sel: '.chat-widget', title: '🤖 Él es Liam',
      text: 'El <b>asesor virtual con inteligencia artificial</b> de UP Equipos. Conversa en español, entiende al cliente y <b>nunca se cansa: atiende 24/7</b>.' },
    { sel: '.chat-widget', title: '✅ Lo que Liam hace HOY',
      text: 'Recomienda el equipo ideal según la obra (interior/exterior, altura), da precios aproximados, arma <b>cotizaciones reales con IVA</b>, <b>crea el cliente</b>, entrega el <b>PDF</b> y conecta al <b>WhatsApp</b> del comercial.' },
    { sel: '.chat-widget', title: '🚀 A dónde va Liam (futuro)',
      text: 'Evolucionará a <b>vender de forma autónoma</b>: cerrar negociaciones, dar seguimiento a cada lead y <b>coordinar con el comercial en tiempo real</b>.' },
    { sel: '.chat-widget', title: '📊 Todo queda registrado',
      text: 'Cada conversación y cotización alimenta un <b>panel comercial en vivo</b>: la empresa ve y gestiona sus clientes al instante, sin perder ni una oportunidad.' },
    { sel: null, title: '¿Listos para un vendedor que nunca duerme?',
      text: 'Todo esto <b>ya está funcionando</b>. UP Equipos + Liam: tecnología que trabaja por ti.' }
  ];

  // ---------- Tooltips (hover) ----------
  const TIPS = [
    { sel: '.chat-header', tip: '🤖 Soy Liam, el asesor con IA. Te recomiendo equipo y te cotizo al instante, 24/7.' },
    { sel: '.nav-cta', tip: '⚡ Cotizar ahora: en horario laboral conecta con el asesor; fuera de horario, con Liam (IA) 24/7.' },
    { sel: '.wa-float', tip: '💬 WhatsApp directo al comercial.' },
    { sel: 'nav .nav-links', tip: '🧭 Secciones con títulos optimizados para SEO.' },
    { sel: '#hero-chat-btn', tip: '💬 Abre el chat con Liam.' }
  ];

  function injectStyles() {
    if (document.getElementById('pres-styles')) return;
    const s = document.createElement('style');
    s.id = 'pres-styles';
    s.textContent = `
      #pres-launch{position:fixed;left:18px;bottom:18px;z-index:9000;display:flex;align-items:center;gap:8px;
        padding:11px 16px;border:none;border-radius:30px;background:#C0001F;color:#fff;font-weight:800;
        font-family:inherit;font-size:.9rem;cursor:pointer;box-shadow:0 6px 22px rgba(192,0,31,.5);
        animation:presPulse 2s infinite}
      #pres-launch:hover{background:#a30019}
      @keyframes presPulse{0%{box-shadow:0 0 0 0 rgba(192,0,31,.55)}70%{box-shadow:0 0 0 16px rgba(192,0,31,0)}100%{box-shadow:0 0 0 0 rgba(192,0,31,0)}}
      #pres-overlay{position:fixed;inset:0;z-index:9100;display:none}
      #pres-hole{position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(10,12,16,.78);
        transition:all .25s ease;pointer-events:none;border:2px solid #C0001F}
      #pres-bubble{position:fixed;z-index:9200;max-width:330px;width:min(330px,86vw);background:#fff;color:#1a1a1a;
        border-radius:16px;padding:16px 16px 14px;box-shadow:0 16px 48px rgba(0,0,0,.45);transition:all .25s ease}
      #pres-bubble h4{margin:0 0 6px;font-size:1rem;color:#C0001F;font-weight:900}
      #pres-bubble p{margin:0;font-size:.88rem;line-height:1.45;color:#374151}
      #pres-bubble p b{color:#1a1a1a}
      .pres-row{display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:10px}
      .pres-count{font-size:.72rem;color:#9ca3af;font-weight:700}
      .pres-btns{display:flex;gap:6px}
      .pres-btn{padding:7px 14px;border:none;border-radius:9px;font-weight:800;font-size:.82rem;cursor:pointer;font-family:inherit}
      .pres-btn.prev{background:#eef0f3;color:#374151}
      .pres-btn.next{background:#C0001F;color:#fff}
      #pres-x{position:absolute;top:8px;right:10px;background:none;border:none;font-size:1.1rem;color:#9ca3af;cursor:pointer}
      #pres-tip{position:fixed;z-index:9000;max-width:260px;background:#1a1d24;color:#fff;padding:9px 12px;
        border-radius:10px;font-size:.8rem;line-height:1.35;box-shadow:0 8px 24px rgba(0,0,0,.4);
        pointer-events:none;opacity:0;transition:opacity .15s;border:1px solid #C0001F}
      @media(max-width:600px){#pres-launch{left:10px;bottom:74px;padding:9px 13px;font-size:.82rem}}
    `;
    document.head.appendChild(s);
  }

  let idx = 0, overlay, hole, bubble;

  function build() {
    overlay = document.createElement('div'); overlay.id = 'pres-overlay';
    hole = document.createElement('div'); hole.id = 'pres-hole';
    bubble = document.createElement('div'); bubble.id = 'pres-bubble';
    overlay.appendChild(hole);
    document.body.appendChild(overlay);
    document.body.appendChild(bubble);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  function start() {
    injectStyles();
    if (!overlay) build();
    idx = 0;
    overlay.style.display = 'block';
    bubble.style.display = 'block';
    showStep();
  }

  function close() {
    if (overlay) overlay.style.display = 'none';
    if (bubble) bubble.style.display = 'none';
  }

  function showStep() {
    const step = STEPS[idx];
    const el = step.sel ? document.querySelector(step.sel) : null;

    const place = () => {
      if (el) {
        const r = el.getBoundingClientRect();
        const pad = 8;
        hole.style.display = 'block';
        hole.style.top = (r.top - pad) + 'px';
        hole.style.left = (r.left - pad) + 'px';
        hole.style.width = (r.width + pad * 2) + 'px';
        hole.style.height = (r.height + pad * 2) + 'px';
      } else {
        hole.style.display = 'none';
      }
      renderBubble(el);
    };

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(place, 380);
    } else {
      place();
    }
  }

  function renderBubble(el) {
    const step = STEPS[idx];
    const last = idx === STEPS.length - 1;
    bubble.innerHTML =
      '<button id="pres-x" aria-label="Cerrar">✕</button>' +
      '<h4>' + step.title + '</h4>' +
      '<p>' + step.text + '</p>' +
      '<div class="pres-row">' +
        '<span class="pres-count">' + (idx + 1) + ' / ' + STEPS.length + '</span>' +
        '<div class="pres-btns">' +
          (idx > 0 ? '<button class="pres-btn prev">‹ Atrás</button>' : '') +
          '<button class="pres-btn next">' + (last ? '¡Listo! ✓' : 'Siguiente ›') + '</button>' +
        '</div>' +
      '</div>';

    bubble.querySelector('#pres-x').onclick = close;
    const nx = bubble.querySelector('.pres-btn.next');
    if (nx) nx.onclick = () => { if (last) close(); else { idx++; showStep(); } };
    const pv = bubble.querySelector('.pres-btn.prev');
    if (pv) pv.onclick = () => { idx--; showStep(); };

    // posicionar el globo
    bubble.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      let top, left;
      if (el) {
        const r = el.getBoundingClientRect();
        // debajo si cabe, si no encima; centrado horizontal respecto al elemento
        if (r.bottom + bh + 18 < window.innerHeight) top = r.bottom + 14;
        else if (r.top - bh - 18 > 0) top = r.top - bh - 14;
        else top = Math.max(12, (window.innerHeight - bh) / 2);
        left = Math.min(Math.max(12, r.left + r.width / 2 - bw / 2), window.innerWidth - bw - 12);
      } else {
        top = (window.innerHeight - bh) / 2;
        left = (window.innerWidth - bw) / 2;
      }
      bubble.style.top = top + 'px';
      bubble.style.left = left + 'px';
      bubble.style.visibility = 'visible';
    });
  }

  // ---------- Tooltips hover ----------
  let tipEl, tipTimer;
  function initTips() {
    tipEl = document.createElement('div'); tipEl.id = 'pres-tip';
    document.body.appendChild(tipEl);
    TIPS.forEach(t => {
      const el = document.querySelector(t.sel);
      if (!el) return;
      el.addEventListener('mouseenter', () => {
        if (overlay && overlay.style.display === 'block') return; // no estorbar el tour
        clearTimeout(tipTimer);
        tipEl.textContent = t.tip;
        const r = el.getBoundingClientRect();
        const tw = 260;
        // Colocar el globo ARRIBA del elemento; si no cabe, debajo. Nunca encima del chat.
        let top = r.top - 46;
        if (top < 8) top = r.bottom + 8;
        let left = Math.min(Math.max(8, r.left), window.innerWidth - tw - 8);
        tipEl.style.top = top + 'px';
        tipEl.style.left = left + 'px';
        tipEl.style.opacity = '1';
        // Auto-ocultar aunque el mouse siga dentro (no tapa el chat)
        tipTimer = setTimeout(() => { tipEl.style.opacity = '0'; }, 3500);
      });
      el.addEventListener('mouseleave', () => { clearTimeout(tipTimer); tipEl.style.opacity = '0'; });
    });
  }

  function initLauncher() {
    injectStyles();
    const b = document.createElement('button');
    b.id = 'pres-launch';
    b.innerHTML = '👋 ¿Cómo funciona?';
    b.title = 'Ver presentación guiada';
    b.addEventListener('click', start);
    document.body.appendChild(b);
  }

  function boot() {
    // Modo presentación DESACTIVADO por defecto: la página queda solo consulta.
    // Se activa solo si la URL trae ?demo=1 (para mostrarla en reuniones).
    const params = new URLSearchParams(location.search);
    if (params.get('demo') !== '1') return;

    initLauncher();
    initTips();
    setTimeout(start, 1200);
    document.addEventListener('keydown', e => { if (e.key === '?') start(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
