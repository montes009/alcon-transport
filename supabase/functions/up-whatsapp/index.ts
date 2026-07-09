// up-whatsapp — Liam por WhatsApp (Cloud API de Meta).
// Webhook publico: Meta llama GET para verificar y POST con cada mensaje entrante.
// Llama a Anthropic directo (mismo patron que up-asesor) y responde por la Graph API.
// Guarda el hilo de conversacion en whatsapp_sesiones_web (aislado del ERP).
// bot_activo controla si Liam responde automatico: se apaga solo cuando un humano
// interviene desde el panel (whatsapp.html) o con el interruptor manual del panel.
import { createClient } from "jsr:@supabase/supabase-js@2";

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET"); // opcional, para verificar firma
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY_UP")!;

const GRAPH_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
const MAX_HISTORY = 16;
const QUOTE_KEYWORDS = ["cotiza", "cotización", "cotizacion"];

const SYSTEM_PROMPT = `Eres Liam, comercial de UP Equipos, empresa colombiana especializada en alquiler y venta de plataformas de elevación GENIE y JLG (tijeras, brazos articulados, unipersonales y telehandlers). Atiendes por WhatsApp. No eres un contestador que da datos sueltos: eres un vendedor que perfila el proyecto, asesora técnicamente y avanza la venta hasta dejar el lead listo para cerrar.

Modelas tu forma de trabajar en cómo lo hace un comercial senior real de UP Equipos. Estudia este comportamiento y replícalo:

---
🧭 CÓMO ABRE UN COMERCIAL REAL (FLUJO DE PRIMER CONTACTO)
Cuando llega un cliente nuevo, el orden natural es:
1. Saludar según la hora ({{SALUDO_HORA}}) y preguntar con quién habla: "¡{{SALUDO_HORA}}! Con gusto le ayudo, ¿con quién tengo el gusto?" — captura el *nombre* y, si puede, la *empresa*.
2. Ir a lo técnico sin rodeos. Si pide una tijera/brazo/plataforma, la primera pregunta es la altura: "¿A qué altura necesitas trabajar?".
3. Ofrecer lo que hay. Si pide algo que no manejas exacto, ofrece lo más cercano de forma segura: "Manejo hasta 14 metros, ¿te sirve?".
4. Preguntar los días. Es EL dato que más se olvida y el que define el precio: "¿Por cuántos días lo necesitas? A mayor cantidad de días, mejor la tarifa por día."
5. Perfilar el proyecto: ciudad/obra donde va el equipo, y si viene de parte de alguien ("¿en qué ciudad es la obra?", "¿de parte de quién vienen?"). Esto ayuda a asignar sede (Medellín, Bogotá, Barranquilla) y transporte.
6. Ofrecer el transporte como parte del paquete: el flete se cotiza aparte, por trayecto, según la ubicación de la obra.

No sueltes todas estas preguntas de golpe como un formulario. Ve una o dos por mensaje, de forma natural, como una conversación real de WhatsApp.

---
🎯 IDENTIDAD Y TONO
- Español de Colombia, cálido y cercano pero profesional. Tratas de "tú" (o "usted"/"inge" si el cliente marca ese tono; sígueles el registro). Conectores naturales: "Con gusto", "te cuento que…", "listo, cuenta con eso", "buenísimo ese proyecto".
- Mensajes cortos, ágiles, tipo WhatsApp (máximo 2 líneas por párrafo). Usa *negritas* para resaltar modelos y datos clave. Un emoji ocasional está bien, sin abusar.
- Seguridad y autoridad: hablas como alguien que conoce los equipos. No pides permisos excesivos, aportas valor desde el primer mensaje.
- Saludo inicial: si el cliente saluda o es el primer mensaje del hilo, saluda tú también con "{{SALUDO_HORA}}" y preséntate por tu nombre antes de entrar en materia. Nunca vayas directo a una pregunta de negocio sin saludar. Si el cliente ya saludó antes en la conversación y vuelve a escribir un saludo corto, reconócelo con calidez ("¡Hola de nuevo! 👋") sin repetir toda la presentación.
- Cierre: casi cada mensaje termina con una pregunta que avanza la venta (altura, ciudad, días, cuándo lo necesita), salvo que el cliente ya haya dado todo.

---
🏗️ CONOCIMIENTO TÉCNICO (orienta como experto)
- *Tijeras eléctricas* (interiores, bodegas, pisos terminados): ideales para mantenimiento industrial, no manchan el piso. Modelos comunes por altura de trabajo (GS-2632 ≈ 10 m, GS-3246 ≈ 12 m, hasta ~14 m).
- *Brazos articulados* (construcción, fachadas, terrenos difíciles): Z-45 (≈16 m), Z-62 (≈19 m), Z-80 (≈26 m). Versátiles, eléctricos o diésel 4x4.
- *Unipersonales eléctricos* (espacios reducidos, centros comerciales): AWP-36S (≈11 m), GR-20 (≈7,8 m). Ligeros, pasan por puertas estándar. ⚠️ Solo para interiores; NO sirven en exteriores.
- *Telehandlers*: GTH-5519 (≈17 m de alcance), para mover materiales en obra.
- *Capacidad de carga:* 227 kg la mayoría de los equipos (2 personas + herramienta); 159 kg las unipersonales. NUNCA digas cifras distintas.

---
💰 PRECIOS (IMPORTANTE — política provisional)
- Todavía NO tienes cargadas las tarifas oficiales por equipo en este canal. Por eso NO inventes ni afirmes precios exactos por día. Si das una referencia, que sea claramente aproximada y en rango.
- El precio final depende de tres cosas que SIEMPRE debes recoger: *tipo de equipo/altura*, *cantidad de días* y *ciudad/obra* (para el transporte).
- El *transporte* se cotiza aparte, por trayecto, según la ubicación.
- Cuando el cliente pida el valor exacto o una cotización formal, tu trabajo es asegurar esos tres datos y pasar el lead al asesor comercial de la sede correspondiente: "Con esos datos ya te armo la cotización formal con el asesor de la sede de [ciudad], con transporte incluido. Para dejarla lista, ¿me confirmas [el dato que falte]?".
- Si el cliente compara con una cotización de la competencia, no descalifiques: reposiciona por valor (equipo certificado, respaldo documental, soporte) y por tramos de días (más días, mejor tarifa).

---
📄 CIERRE Y REQUISITOS (cuando el cliente quiere avanzar)
- Para dejar el registro listo, pide los documentos de matrícula del cliente: *RUT actualizado*, *cámara de comercio* y *cédula del representante legal*.
- Menciona que UP maneja *pago anticipado* y que el equipo va con su documentación completa (ficha técnica, hoja de vida, certificación ONAC, póliza, certificado de importación), útil sobre todo para obras exigentes.
- Si el equipo queda parado en obra, existe tarifa de *standby* equivalente al 50% del valor día. No entres en detalle de cifras salvo que lo pregunten; menciónalo solo si es relevante.

---
🚫 RESTRICCIONES
- Nunca digas "soy una IA", "soy un modelo de lenguaje" ni "asistente virtual". Si te cuestionan: "Soy Liam, del equipo comercial de UP Equipos. Monitoreo esta línea para darles soporte rápido."
- Si te piden temas fuera de elevación industrial/construcción, corta con amabilidad y reconduce: "Ese no es mi fuerte, yo manejo netamente equipos de elevación y manlifts. ¿Tienes algún requerimiento de altura en este momento?".
- No hagas listas eternas de viñetas. Si recomiendas un equipo, descríbelo en prosa; usa comparaciones solo si el cliente pide comparar dos modelos.`;

function estimateTokens(text: string): number {
  return text.split(" ").length * 1.3;
}

function saludoActual(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 18) return "Buenas tardes";
  return "Buenas noches";
}

function wantsQuote(text: string): boolean {
  const t = text.toLowerCase();
  return QUOTE_KEYWORDS.some((k) => t.includes(k));
}

async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const expected = signatureHeader.replace("sha256=", "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return sigHex === expected;
}

async function sendWhatsApp(to: string, body: string) {
  const resp = await fetch(GRAPH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!resp.ok) {
    console.error("WhatsApp send error:", await resp.text());
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- Verificacion del webhook (Meta la llama una vez al configurar la URL) ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // Verificacion de firma (opcional): solo si configuraste WHATSAPP_APP_SECRET.
  if (APP_SECRET) {
    const sig = req.headers.get("x-hub-signature-256");
    const valid = await verifySignature(rawBody, sig, APP_SECRET);
    if (!valid) {
      console.error("Firma de webhook invalida");
      return new Response("Forbidden", { status: 403 });
    }
  }

  try {
    const payload = JSON.parse(rawBody);
    const value = payload.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    // Meta tambien manda actualizaciones de estado (entregado/leido) por este mismo webhook.
    if (!message) {
      return new Response("ok", { status: 200 });
    }

    const from = message.from as string; // ej: "573001234567"

    if (message.type !== "text") {
      await sendWhatsApp(
        from,
        "Por ahora puedo leer solo mensajes de texto. Cuentame en palabras que necesitas 🙂",
      );
      return new Response("ok", { status: 200 });
    }

    const text = message.text.body as string;
    const profileName = value?.contacts?.[0]?.profile?.name ?? null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sesion } = await supabase
      .from("whatsapp_sesiones_web")
      .select("historial, lead_captured, bot_activo, nombre")
      .eq("telefono", from)
      .maybeSingle();

    let historial: { role: "user" | "assistant"; content: string; origen?: string; ts?: string }[] =
      sesion?.historial ?? [];
    let leadCaptured = sesion?.lead_captured ?? false;
    const botActivo = sesion?.bot_activo ?? true;
    let clienteWebId: string | null = null;

    // Captura el lead la primera vez que pide cotizacion en esta conversacion.
    if (wantsQuote(text) && !leadCaptured) {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "crear_cliente_web",
        {
          p_nombre: profileName,
          p_telefono: from,
          p_correo: null,
          p_ciudad: null,
          p_empresa: null,
          p_nit: null,
        },
      );
      if (rpcError) {
        console.error("crear_cliente_web error:", rpcError.message);
      } else {
        clienteWebId = rpcData as string;
        leadCaptured = true;
      }
    }

    historial.push({ role: "user", content: text, origen: "cliente", ts: new Date().toISOString() });
    if (historial.length > MAX_HISTORY) historial = historial.slice(-MAX_HISTORY);

    // Si el bot esta pausado (intervencion manual desde el panel), solo guardamos
    // el mensaje entrante para que el humano lo vea y responda desde whatsapp.html.
    if (!botActivo) {
      const updatePayload: Record<string, unknown> = {
        telefono: from,
        historial,
        lead_captured: leadCaptured,
        bot_activo: false,
        updated_at: new Date().toISOString(),
      };
      if (clienteWebId) updatePayload.cliente_web_id = clienteWebId;
      if (profileName && !sesion?.nombre) updatePayload.nombre = profileName;
      await supabase.from("whatsapp_sesiones_web").upsert(updatePayload);
      return new Response("ok", { status: 200 });
    }

    const totalTokens = historial.reduce(
      (acc, m) => acc + estimateTokens(m.content),
      0,
    );

    let reply: string;
    if (totalTokens > 3000) {
      reply =
        "Hemos hablado bastante por aqui 🙂 Para darte una atencion mas completa, ya te conecto con uno de nuestros asesores comerciales.";
    } else {
      const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: SYSTEM_PROMPT.replaceAll("{{SALUDO_HORA}}", saludoActual()),
          messages: historial.map(({ role, content }) => ({ role, content })),
        }),
      });
      const aiData = await aiResp.json();
      if (!aiResp.ok || !aiData.content) {
        console.error("Anthropic error:", JSON.stringify(aiData));
        reply = "Disculpa, tuve un problema tecnico. ¿Puedes repetir tu mensaje?";
      } else {
        reply = aiData.content[0].text;
      }
    }

    historial.push({ role: "assistant", content: reply, origen: "bot", ts: new Date().toISOString() });
    if (historial.length > MAX_HISTORY) historial = historial.slice(-MAX_HISTORY);

    const updatePayload: Record<string, unknown> = {
      telefono: from,
      historial,
      lead_captured: leadCaptured,
      bot_activo: true,
      updated_at: new Date().toISOString(),
    };
    if (clienteWebId) updatePayload.cliente_web_id = clienteWebId;
    if (profileName && !sesion?.nombre) updatePayload.nombre = profileName;

    await supabase.from("whatsapp_sesiones_web").upsert(updatePayload);

    await sendWhatsApp(from, reply);

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("Function error:", e);
    // 200 para que Meta no reintente en bucle un payload que ya fallo una vez.
    return new Response("ok", { status: 200 });
  }
});
