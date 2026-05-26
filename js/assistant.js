/* ============================================
   UP EQUIPOS - assistant.js
   Asesor virtual comercial
   
   Para conectar con Claude API:
   1. Descomenta la sección "MODO API"
   2. Reemplaza ENDPOINT con tu Supabase Edge Function
   3. Comenta la sección "MODO SIMULADO"
   ============================================ */

const UPAssistant = (() => {

  // ---- Estado ----
  let isTyping = false;
  let conversationHistory = [];

  // ---- Respuestas simuladas por palabras clave ----
  const responses = {
    saludo: [
      "Hola! Estoy aquí para ayudarte a encontrar el equipo de elevación ideal para tu proyecto. ¿Qué tipo de trabajo necesitas realizar?",
      "¡Bienvenido! Soy el asesor de UP Equipos. Cuéntame sobre tu proyecto y te recomiendo el equipo perfecto."
    ],
    altura: [
      "La altura de trabajo es clave para elegir el equipo correcto. ¿Cuántos metros necesitas alcanzar? Con eso te puedo recomendar entre tijera eléctrica (hasta 14m), brazo articulado (hasta 20m) o telescópico (hasta 40m+).",
      "¡Importante definir la altura! Tenemos equipos desde 6 hasta más de 40 metros. ¿Cuál es la altura máxima que necesitas?"
    ],
    obra: [
      "Para obras de construcción tenemos equipos todoterreno con tracción 4x4, perfectos para superficies irregulares. ¿La obra es en interiores o exteriores? Eso define si necesitamos motor diésel o eléctrico.",
      "En obras de construcción lo más importante es la estabilidad y el acceso. ¿Estás trabajando en estructura o en acabados? Tenemos braza articulados y telescópicos Genie para ambos casos."
    ],
    interior: [
      "Para trabajo en interiores recomendamos equipos eléctricos: cero emisiones, silenciosos y compactos. Las tijeras eléctricas son ideales para bodegas, centros comerciales y plantas industriales. ¿Qué altura necesitas?",
      "Interior perfecto para nuestras tijeras eléctricas o brazos articulados eléctricos. No generan gases ni ruido. ¿El piso es plano o tiene desniveles?"
    ],
    exterior: [
      "Para exterior con superficies irregulares, los equipos diésel 4x4 son la mejor opción. Son robustos y tienen mayor capacidad de carga. ¿El terreno es blando o pavimentado?",
      "Exteriores requieren equipos con buena tracción. Tenemos telescópicos y braza articulados Genie con opción 4x4. ¿Cuánto tiempo necesitas el equipo?"
    ],
    electrico: [
      "Los equipos eléctricos son perfectos para interiores y zonas sensibles. Cero emisiones, menor ruido y menor costo operativo. ¿Necesitas tijera o brazo articulado eléctrico?",
      "Excelente elección para ambientes controlados. Nuestras tijeras eléctricas van desde 6m hasta 14m de altura. ¿En qué ciudad necesitas el equipo?"
    ],
    diesel: [
      "Los equipos diésel son ideales para exteriores y terrenos difíciles. Mayor potencia y autonomía. Tenemos braza telescópicos y articulados diésel con tracción 4x4.",
      "Diésel es la mejor opción para obras exteriores. ¿Necesitas el equipo en Medellín, Bogotá o Barranquilla? Tenemos sedes en las tres ciudades."
    ],
    disponibilidad: [
      "Para verificar disponibilidad en tiempo real, necesito saber: ciudad (Medellín, Bogotá o Barranquilla), tipo de equipo y fechas. ¿Me puedes dar esa información? O puedes llamar directamente: Medellín 604 4447178.",
      "Consulto disponibilidad ahora mismo. Dame el tipo de equipo que necesitas, la ciudad y las fechas, y te confirmo en minutos."
    ],
    precio: [
      "Los precios varían según el tipo de equipo, el tiempo de alquiler y la ciudad. Para darte una cotización exacta necesito: ¿qué equipo necesitas?, ¿cuántos días? y ¿en qué ciudad? Con eso genero la cotización.",
      "Manejamos tarifas competitivas con todo incluido: seguro, mantenimiento y soporte técnico. Para una cotización personalizada dime el equipo y el tiempo de uso."
    ],
    genie: [
      "Somos distribuidores autorizados GENIE en Colombia. Eso nos da acceso directo a repuestos originales, soporte técnico certificado y las últimas novedades de la marca. ¿Te interesa algún modelo Genie en particular?",
      "Como distribuidores oficiales GENIE tenemos garantía de marca y personal certificado directamente por la fábrica. ¿Buscas comprar o alquilar un equipo Genie?"
    ],
    ipaf: [
      "Ofrecemos certificaciones IPAF bajo la norma ISO 18878. Somos formadores certificados con train-the-trainers directo de Genie. Los cursos incluyen operación segura y procedimientos de emergencia. ¿Cuántas personas necesitan certificarse?",
      "Las certificaciones IPAF son obligatorias para operar equipos de elevación. Tenemos cursos para operadores y formadores. ¿Necesitas formación para tu equipo?"
    ],
    tijera: [
      "Las tijeras eléctricas son perfectas para trabajo horizontal en interiores. Tenemos modelos de 6m hasta 14m de altura de trabajo. Son compactas, silenciosas y muy maniobrables. ¿Para qué proyecto las necesitas?",
    ],
    telescopico: [
      "Los telescópicos son para grandes alturas y alcances horizontales. Tenemos modelos hasta 40m+. Ideales para obras de infraestructura y proyectos industriales de gran escala.",
    ],
    brazo: [
      "Los braza articulados permiten trabajar en zonas de difícil acceso, esquivando obstáculos. Tenemos modelos eléctricos para interior y diésel 4x4 para exterior. ¿Cuál es el reto de tu proyecto?",
    ],
    default: [
      "Entiendo tu consulta. Para darte la mejor recomendación, ¿me puedes decir si el trabajo es en interior o exterior, y cuál es la altura aproximada que necesitas alcanzar?",
      "Esa es una buena pregunta. En UP Equipos manejamos todo tipo de soluciones de elevación. ¿Me cuentas más detalles sobre tu proyecto para orientarte mejor?",
      "Claro, puedo ayudarte con eso. ¿Estás buscando alquiler o compra de equipo? Y ¿en qué ciudad operas?"
    ]
  };

  // ---- Detectar intención ----
  function detectIntent(text) {
    const t = text.toLowerCase();
    if (/hola|buenos|buenas|saludos|hey/.test(t)) return 'saludo';
    if (/altura|metros|alto|elevaci/.test(t)) return 'altura';
    if (/obra|construcci|proyecto|edifici/.test(t)) return 'obra';
    if (/interior|adentro|bodega|planta|almac/.test(t)) return 'interior';
    if (/exterior|afuera|terreno|campo|obra/.test(t)) return 'exterior';
    if (/el.ctric|batería|bater/.test(t)) return 'electrico';
    if (/di.sel|diesel|gasolina|combustible/.test(t)) return 'diesel';
    if (/disponib|cuando|fecha|reserva/.test(t)) return 'disponibilidad';
    if (/precio|costo|cuánto|tarifa|valor|cotiz/.test(t)) return 'precio';
    if (/genie|marca|distribuid/.test(t)) return 'genie';
    if (/ipaf|certificac|curso|formac/.test(t)) return 'ipaf';
    if (/tijera|scissor/.test(t)) return 'tijera';
    if (/telesc/.test(t)) return 'telescopico';
    if (/brazo|articulado|boom/.test(t)) return 'brazo';
    return 'default';
  }

  // ---- Respuesta aleatoria ----
  function getResponse(intent) {
    const pool = responses[intent] || responses.default;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---- Render mensaje ----
  function renderMessage(text, type) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;

    const msg = document.createElement('div');
    msg.className = `msg ${type}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = type === 'bot' ? '🔧' : '👤';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  // ---- Indicador de escritura ----
  function showTyping() {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;

    const typing = document.createElement('div');
    typing.className = 'msg bot';
    typing.id = 'typing-indicator';
    typing.innerHTML = `
      <div class="msg-avatar">🔧</div>
      <div class="msg-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
  }

  // ---- Procesar mensaje del usuario ----
  async function processMessage(userText) {
    if (isTyping || !userText.trim()) return;
    isTyping = true;

    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) sendBtn.disabled = true;

    // Mostrar mensaje usuario
    renderMessage(userText, 'user');
    conversationHistory.push({ role: 'user', content: userText });

    // Mostrar typing
    showTyping();

    // Simular delay de respuesta
    const delay = 1000 + Math.random() * 1000;

    try {
      /* ============================================
      // MODO SIMULADO (activo por defecto)
      // ============================================
      await new Promise(r => setTimeout(r, delay));
      const intent = detectIntent(userText);
      const botResponse = getResponse(intent);
      hideTyping();
      renderMessage(botResponse, 'bot');
      conversationHistory.push({ role: 'assistant', content: botResponse });
      */

      // ============================================
      // MODO API — conectado con Claude via Supabase
      // ============================================
      const SUPABASE_URL = 'https://oguxdohmutqgacahcwop.supabase.co/functions/v1/up-asesor';
      const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ndXhkb2htdXRxZ2FjYWhjd29wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Mjc0NzcsImV4cCI6MjA4ODMwMzQ3N30.RRruTo8B7k4R97Igq7_KV1PV58FqrpIzEu0R_MXIwR8';

      const response = await fetch(SUPABASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`
        },
        body: JSON.stringify({
          message: userText,
          history: conversationHistory.slice(-6)
        })
      });

      if (!response.ok) throw new Error('Error conexión');
      const data = await response.json();
      hideTyping();
      const botResponse = data.response;
      renderMessage(botResponse, 'bot');
      conversationHistory.push({ role: 'assistant', content: botResponse });

    } catch (error) {
      hideTyping();
      renderMessage('Disculpa, hubo un problema de conexión. Por favor comunícate con nosotros al 604 4447178.', 'bot');
      console.error('[UPAssistant] Error:', error);
    }

    isTyping = false;
    if (sendBtn) sendBtn.disabled = false;
  }

  // ---- Mensaje inicial automático ----
  function init() {
    const messages = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');

    if (!messages) return;

    // Mensaje de bienvenida con delay
    setTimeout(() => {
      renderMessage(
        'Hola 👋 Soy el asesor de UP Equipos. Cuéntame qué tipo de proyecto tienes y te ayudo a encontrar el equipo ideal para trabajos en altura.',
        'bot'
      );
    }, 800);

    // Enviar con botón
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        if (!input) return;
        const text = input.value.trim();
        if (text) {
          processMessage(text);
          input.value = '';
          input.style.height = 'auto';
        }
      });
    }

    // Enviar con Enter (Shift+Enter = salto de línea)
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = input.value.trim();
          if (text) {
            processMessage(text);
            input.value = '';
            input.style.height = 'auto';
          }
        }
      });

      // Auto-resize textarea
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
      });
    }

    // Scroll del hero al chat
    const heroChatBtn = document.getElementById('hero-chat-btn');
    if (heroChatBtn) {
      heroChatBtn.addEventListener('click', () => {
        document.getElementById('asesor')?.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => input?.focus(), 600);
      });
    }

    // CTA final al chat
    const ctaChatBtn = document.getElementById('cta-chat-btn');
    if (ctaChatBtn) {
      ctaChatBtn.addEventListener('click', () => {
        document.getElementById('asesor')?.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => input?.focus(), 600);
      });
    }
  }

  return { init, processMessage };
})();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', UPAssistant.init);
