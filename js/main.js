/* ============================================
   UP EQUIPOS - main.js
   Animaciones, navegación, catálogo y utilidades
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ============================================
  // NAVBAR - scroll effect + mobile menu
  // ============================================
  const navbar = document.querySelector('.navbar');
  const navToggle = document.querySelector('.nav-toggle');
  const navMobile = document.querySelector('.nav-mobile');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
      navbar?.classList.add('scrolled');
    } else {
      navbar?.classList.remove('scrolled');
    }
  }, { passive: true });

  navToggle?.addEventListener('click', () => {
    navToggle.classList.toggle('active');
    navMobile?.classList.toggle('open');
  });

  // Cerrar menú al hacer click en link
  navMobile?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navToggle?.classList.remove('active');
      navMobile?.classList.remove('open');
    });
  });

  // ============================================
  // REVEAL ON SCROLL - animaciones de entrada
  // ============================================
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // ============================================
  // STATS - contador animado
  // ============================================
  function animateCounter(el, target, suffix = '') {
    const duration = 1500;
    const startTime = performance.now();
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    function frame(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = target * eased;

      if (progress < 1) {
        el.textContent = Math.floor(current) + suffix;
        requestAnimationFrame(frame);
      } else {
        el.textContent = target + suffix;
      }
    }

    requestAnimationFrame(frame);
  }

  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const counters = entry.target.querySelectorAll('[data-count]');
        counters.forEach(counter => {
          const target = parseInt(counter.dataset.count);
          const suffix = counter.dataset.suffix || '';
          animateCounter(counter, target, suffix);
        });
        statsObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  const statsBar = document.querySelector('.stats-inner');
  if (statsBar) statsObserver.observe(statsBar);

  // ============================================
  // CATÁLOGO - datos de equipos
  // ============================================
  const equipos = [
    {
      id: 1,
      categoria: 'alquiler',
      tipo: 'brazo',
      categoria_label: 'Brazo Articulado',
      modelo: 'Z-45/25 RT',
      desc: 'Accede a zonas de difícil acceso con articulación de doble brazo. Tracción 4x4 para cualquier terreno en exteriores exigentes.',
      specs: [
        { icon: 'altura',    label: 'Altura máx.',  valor: '16 m'    },
        { icon: 'capacidad', label: 'Capacidad',     valor: '227 kg'  },
        { icon: 'traccion',  label: 'Tracción',      valor: '4x4'     }
      ],
      imagen: 'IMAGENES POR INCORPORAR/BRAZO ARTICULADO/ChatGPT Image 25 may 2026, 09_00_14 p.m..png'
    },
    {
      id: 2,
      categoria: 'alquiler',
      tipo: 'brazo',
      categoria_label: 'Brazo Articulado',
      modelo: 'Z-80/60 RT',
      desc: 'Gran alcance vertical y horizontal para proyectos de infraestructura y espacios de difícil acceso con máxima altura de trabajo.',
      specs: [
        { icon: 'altura',    label: 'Altura máx.',  valor: '26 m'    },
        { icon: 'capacidad', label: 'Capacidad',     valor: '227 kg'  },
        { icon: 'traccion',  label: 'Tracción',      valor: '4x4'     }
      ],
      imagen: 'IMAGENES POR INCORPORAR/BRAZO ARTICULADO Z80/ChatGPT Image 25 may 2026, 09_16_37 p.m..png'
    },
    {
      id: 3,
      categoria: 'alquiler',
      tipo: 'tijera',
      categoria_label: 'Tijera Eléctrica',
      modelo: 'GS-3246',
      desc: 'Compacta y silenciosa. Ideal para interiores: bodegas, centros comerciales e industria. Cero emisiones, máxima maniobrabilidad.',
      specs: [
        { icon: 'altura',     label: 'Altura máx.',  valor: '12 m'      },
        { icon: 'capacidad',  label: 'Capacidad',     valor: '454 kg'    },
        { icon: 'propulsion', label: 'Propulsión',    valor: 'Eléctrico' }
      ],
      imagen: 'IMAGENES POR INCORPORAR/TIJERA/ChatGPT Image 25 may 2026, 09_03_51 p.m..png'
    },
    {
      id: 4,
      categoria: 'alquiler',
      tipo: 'unipersonal',
      categoria_label: 'Unipersonal Autopropulsada',
      modelo: 'AWP-36S',
      desc: 'Plataforma unipersonal autopropulsada ultracompacta. Perfecta para mantenimiento en altura, instalaciones y trabajo en espacios reducidos.',
      specs: [
        { icon: 'altura',     label: 'Altura máx.',  valor: '11 m'      },
        { icon: 'capacidad',  label: 'Capacidad',     valor: '159 kg'    },
        { icon: 'propulsion', label: 'Propulsión',    valor: 'Eléctrico' }
      ],
      imagen: 'IMAGENES POR INCORPORAR/UNIPERSONAL AUTOPROPULSADA/ChatGPT Image 25 may 2026, 09_06_29 p.m..png'
    },
    {
      id: 5,
      categoria: 'alquiler',
      tipo: 'unipersonal',
      categoria_label: 'Unipersonal Manual',
      modelo: 'AWP-20S',
      desc: 'Mástil vertical no autopropulsado para trabajos de mantenimiento en interiores. Ligero, compacto y de fácil operación en espacios muy reducidos.',
      specs: [
        { icon: 'altura',     label: 'Altura máx.',  valor: '6 m'    },
        { icon: 'capacidad',  label: 'Capacidad',     valor: '113 kg' },
        { icon: 'propulsion', label: 'Propulsión',    valor: 'Manual' }
      ],
      imagen: 'IMAGENES POR INCORPORAR/UNIPERSONAL NO AUTOPROPULSADA/ChatGPT Image 25 may 2026, 09_11_28 p.m..png'
    },
    {
      id: 6,
      categoria: 'venta',
      tipo: 'telehandler',
      categoria_label: 'Telehandler',
      modelo: 'GTH-5519',
      desc: 'Manipulador telescópico para carga y elevación en obras de construcción. Versátil, potente y con amplio alcance para los proyectos más exigentes.',
      specs: [
        { icon: 'altura',     label: 'Altura máx.',  valor: '17 m'    },
        { icon: 'capacidad',  label: 'Capacidad',     valor: '2500 kg' },
        { icon: 'propulsion', label: 'Propulsión',    valor: 'Diésel'  }
      ],
      imagen: 'IMAGENES POR INCORPORAR/THELEHANDER/ChatGPT Image 25 may 2026, 09_12_38 p.m..png'
    }
  ];

  // ---- Icono SVG por tipo de spec ----
  function getSpecIconPath(type) {
    const p = {
      altura:     '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
      capacidad:  '<rect x="3" y="11" width="18" height="11" rx="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      propulsion: '<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>',
      traccion:   '<circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3v-4l2-4h9l4 4v4h-2"/>'
    };
    return p[type] || p.altura;
  }

  // ---- IntersectionObserver para animaciones de tarjeta ----
  const cardAnimObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('card-visible');
        cardAnimObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ---- Render catálogo ----
  function renderCatalogo(filtro = 'todos') {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return;

    const filtered = filtro === 'todos'
      ? equipos
      : (filtro === 'alquiler' || filtro === 'venta')
        ? equipos.filter(e => e.categoria === filtro)
        : equipos.filter(e => e.tipo === filtro);

    grid.innerHTML = filtered.map(eq => {
      // Solo el separador / se convierte en span; el modelo ya escapado primero
      const modeloHTML = esc(eq.modelo).replace('/', '<span class="slash">/</span>');

      const specsHTML = eq.specs.map(s => `
        <div class="spec-item">
          <svg class="spec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            ${getSpecIconPath(s.icon)}
          </svg>
          <div class="spec-data">
            <span class="spec-label">${esc(s.label)}</span>
            <span class="spec-val">${esc(s.valor)}</span>
          </div>
        </div>
      `).join('');

      return `
        <article class="equipo-card" data-id="${esc(eq.id)}" data-equipo="${esc(eq.categoria_label + ' ' + eq.modelo)}" role="listitem">
          <svg class="card-circles" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="450" cy="300" r="200" fill="none" stroke="rgba(192,0,31,0.15)" stroke-width="1.5"/>
            <circle cx="450" cy="300" r="275" fill="none" stroke="rgba(192,0,31,0.09)" stroke-width="1"/>
            <circle cx="450" cy="300" r="350" fill="none" stroke="rgba(192,0,31,0.06)" stroke-width="1"/>
            <circle cx="450" cy="300" r="425" fill="none" stroke="rgba(192,0,31,0.03)" stroke-width="1"/>
          </svg>
          <div class="card-dots" aria-hidden="true"></div>
          <div class="card-content">
            <div class="card-cat">
              <span class="card-cat-line"></span>
              <span class="card-cat-text">${esc(eq.categoria_label)}</span>
            </div>
            <h3 class="card-nombre">${modeloHTML}</h3>
            <p class="card-desc">${esc(eq.desc)}</p>
            <div class="card-specs">${specsHTML}</div>
            <button class="card-btn js-consultar">
              Consultar Disponibilidad &rsaquo;
            </button>
          </div>
          <div class="card-image">
            <img
              src="${esc(eq.imagen)}"
              alt="${esc(eq.categoria_label + ' ' + eq.modelo)}"
              loading="lazy"
              onerror="this.style.opacity='0'"
            >
          </div>
        </article>
      `;
    }).join('');

    // Observar cada tarjeta para activar animaciones al entrar en viewport
    grid.querySelectorAll('.equipo-card').forEach(card => {
      cardAnimObserver.observe(card);
    });
  }

  // ---- Filtros ----
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCatalogo(btn.dataset.filter);
    });
  });

  // Render inicial
  renderCatalogo();

  // ============================================
  // WHATSAPP - consultar equipo
  // ============================================
  window.consultarEquipo = function(nombreEquipo) {
    const mensaje = encodeURIComponent(
      `Hola UP Equipos! Me interesa consultar disponibilidad del equipo: ${nombreEquipo}. ¿Me pueden dar información?`
    );
    window.open(`https://wa.me/573117135363?text=${mensaje}`, '_blank');
  };

  // ============================================
  // SMOOTH SCROLL para links de navegación
  // ============================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ============================================
  // PARALLAX suave en el hero
  // ============================================
  const heroBgImg = document.querySelector('.hero-bg img');
  if (heroBgImg) {
    window.addEventListener('scroll', () => {
      if (window.scrollY < window.innerHeight) {
        heroBgImg.style.transform = `translateY(${window.scrollY * 0.3}px)`;
      }
    }, { passive: true });
  }

  // ============================================
  // CURSOR personalizado (desktop only)
  // ============================================
  if (window.matchMedia('(pointer: fine)').matches) {
    const cursor = document.createElement('div');
    cursor.style.cssText = `
      position: fixed; top: 0; left: 0; z-index: 9999;
      width: 8px; height: 8px;
      background: #C0001F; border-radius: 50%;
      pointer-events: none; transition: transform 0.15s ease;
      mix-blend-mode: difference;
    `;
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', e => {
      cursor.style.left = e.clientX - 4 + 'px';
      cursor.style.top = e.clientY - 4 + 'px';
    });

    document.querySelectorAll('a, button, .equipo-card, .trust-card').forEach(el => {
      el.addEventListener('mouseenter', () => cursor.style.transform = 'scale(3)');
      el.addEventListener('mouseleave', () => cursor.style.transform = 'scale(1)');
    });
  }

  // ============================================
  // FORMULARIO DE COTIZACIÓN (si existe)
  // ============================================
  const cotizaForm = document.getElementById('cotiza-form');
  if (cotizaForm) {
    cotizaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(cotizaForm);
      const nombre = data.get('nombre') || '';
      const tipo = data.get('tipo') || 'Alquiler';
      const mensaje = encodeURIComponent(
        `Hola! Soy ${nombre}. Quiero cotizar: ${tipo}. Los contacto desde la página web de UP Equipos.`
      );
      window.open(`https://wa.me/573117135363?text=${mensaje}`, '_blank');
    });
  }

  console.log('[UP Equipos] Sistema iniciado correctamente.');
});

/* ---- Selector de sedes en el mapa ---- */
(function(){
  var iframe = document.getElementById('mapa-iframe');
  var dirBtn = document.getElementById('mapa-directions-btn');
  var btns   = document.querySelectorAll('.mapa-sede-btn');

  btns.forEach(function(btn){
    btn.addEventListener('click', function(){
      btns.forEach(function(b){ b.classList.remove('active'); });
      this.classList.add('active');

      var lat = this.dataset.lat;
      var lng = this.dataset.lng;

      if(iframe){
        iframe.src = 'https://maps.google.com/maps?q=' +
          lat + ',' + lng + '&z=16&output=embed&hl=es';
      }

      if(dirBtn){
        dirBtn.href = 'https://www.google.com/maps/dir/?api=1&destination=' +
          lat + ',' + lng;
      }
    });
  });
})();
