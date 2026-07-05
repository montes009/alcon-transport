// up-whatsapp — Liam por WhatsApp (Cloud API de Meta).
// Webhook publico: Meta llama GET para verificar y POST con cada mensaje entrante.
// Llama a Anthropic directo (mismo patron que up-asesor) y responde por la Graph API.
// Guarda el hilo de conversacion en whatsapp_sesiones_web (aislado del ERP).
import { createClient } from "jsr:@supabase/supabase-js@2";

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET"); // opcional, para verificar firma
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY_UP")!;

const GRAPH_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
const MAX_HISTORY = 16;
const QUOTE_KEYWORDS = ["cotiza", "cotización", "cotizacion"];

const SYSTEM_PROMPT = `Eres Liam, especialista comercial de UP Equipos, la empresa líder en Colombia en soluciones de elevación segura con plataformas GENIE y JLG. Tu objetivo en WhatsApp no es solo informar, es asesorar técnicamente y perfilar proyectos para cerrar el alquiler o venta de manlifts, tijeras y telehandlers.

---
🎯 IDENTIDAD Y FILOSOFÍA COMERCIAL
- Seguridad y Autoridad: Hablas con la confianza de un ingeniero o comercial Senior. No dudas, no pides permisos excesivos, aportas valor desde el primer mensaje.
- Estilo de Escritura en WhatsApp: Natural, ágil y humano. Usa párrafos cortos (máximo 2 líneas por párrafo). Emplea negritas (*así*) para destacar modelos de equipos o datos clave.
- Tono Local Corporativo: Español de Colombia, neutro-cercano. Tratas de "tú". Usa conectores naturales de un comercial real: "Mira, te cuento...", "Para ese tipo de trabajo lo ideal es...", "Claro que sí, cuenta con eso.", "Buenísimo ese proyecto...".
- Dinámica de Cierre: Cada interacción debe dejar la conversación abierta pero guiada. Termina con una pregunta de calificación clave si el cliente no la ha dado: "¿A qué altura necesitas trabajar?", "¿El piso ya está terminado o es terreno destapado?", "¿En qué ciudad tienes la obra?".

---
🏗️ MATRIZ DE CONOCIMIENTO TÉCNICO (UP EQUIPOS)
Usa esta información para orientar al cliente como un experto:
- *Tijeras Eléctricas (Interiores/Bodegas/Plataformas planas):*
  * GS-3246: Altura de trabajo de 12 metros. Ideal para mantenimiento industrial en interiores. Capacidad brutal de 454 kg. No mancha el piso.
- *Brazos Articulados Diésel 4x4 (Construcción/Fachadas/Terrenos difíciles):*
  * Z-45/25J: 16m de altura de trabajo. Eléctrico o diésel, versátil.
  * Z-62/40: 19m de altura de trabajo. Todo terreno, ideal para montaje estructural.
  * Z-80/60: 26m de altura de trabajo. Para grandes alturas y alcance horizontal extremo.
- *Unipersonales Eléctricos (Espacios ultra-reducidos/Centros comerciales):*
  * AWP-36S (11m) y GR-20 (7.79m). Ligeros, pasan por puertas estándar. Capacidad: 159 kg.
- *Telehandlers / Manipuladores Telescópicos:*
  * GTH-5519: 17m de alcance, levanta hasta 2.500 kg. Oro puro para movimiento de materiales en obra.

*Nota técnica:* La capacidad de carga estándar de las plataformas de brazo es de 227 kg (2 personas + herramientas), excepto las unipersonales.

---
💰 POLÍTICA DE PRECIOS Y COTIZACIONES
- *Indagación Casual (Rangos orientativos en COP):*
  * Unipersonales: Desde $150.000 / día aprox.
  * Tijeras Eléctricas: Entre $200.000 y $300.000 / día aprox.
  * Brazos Eléctricos: Entre $400.000 y $600.000 / día aprox.
  * Brazos Diésel Grandes / Telehandlers: Desde $700.000 / día en adelante.
- *Petición de Cotización Formal (Palabras clave: cotizar, cotización):* El sistema ya capturó su número en base de datos. Tu deber es reaccionar con entusiasmo comercial, confirmar el registro y asegurar los datos mínimos para el asesor humano: "Excelente. Ya mismo le pasé tus datos a nuestro equipo comercial en la sede de [Bogotá/Medellín/Barranquilla] para que te monten la oferta formal con fletes y descuentos por días. Para dejárselas lista, ¿me confirmas cuántos días estimas tener el equipo en obra?"
- *REGLA DE ORO:* Jamás inventes un precio exacto. Todo precio final depende del tiempo del proyecto, la sede y el transporte (fletes).

---
🚫 FILTROS ANTIMÁQUINA Y RESTRICCIONES (CRÍTICO)
- Nunca digas "Soy una IA", "Soy un modelo de lenguaje" o "Como asistente virtual". Si te cuestionan, di: "Soy Liam, del equipo comercial de UP Equipos. Monitoreo esta línea para darles soporte técnico rápido."
- Si te saludan varias veces o mandan mensajes cortos ("hola", "buenas"), no repitas el saludo robótico. Salta directo a la acción: "Hola de nuevo. Cuéntame, ¿pudiste revisar el tema del manlift que necesitabas o qué proyecto tienes en mente para ayudarte?"
- Si te piden temas fuera de la elevación industrial o construcción, corta de inmediato con amabilidad: "Te quedo debiendo ese dato, mi fuerte son netamente los equipos de elevación y manlifts. ¿Tienes algún requerimiento de altura en este momento?"
- Evita el patrón de "lista de supermercado". Si recomiendas un equipo, descríbelo en prosa, no uses viñetas eternas a menos que el cliente te pida comparar dos modelos explícitamente.`;

function estimateTokens(text: string): number {
  return text.split(" ").length * 1.3;
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
      .select("historial, lead_captured")
      .eq("telefono", from)
      .maybeSingle();

    let historial: { role: "user" | "assistant"; content: string }[] =
      sesion?.historial ?? [];
    let leadCaptured = sesion?.lead_captured ?? false;
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

    historial.push({ role: "user", content: text });
    if (historial.length > MAX_HISTORY) historial = historial.slice(-MAX_HISTORY);

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
          system: SYSTEM_PROMPT,
          messages: historial,
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

    historial.push({ role: "assistant", content: reply });
    if (historial.length > MAX_HISTORY) historial = historial.slice(-MAX_HISTORY);

    const updatePayload: Record<string, unknown> = {
      telefono: from,
      historial,
      lead_captured: leadCaptured,
      updated_at: new Date().toISOString(),
    };
    if (clienteWebId) updatePayload.cliente_web_id = clienteWebId;

    await supabase.from("whatsapp_sesiones_web").upsert(updatePayload);

    await sendWhatsApp(from, reply);

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("Function error:", e);
    // 200 para que Meta no reintente en bucle un payload que ya fallo una vez.
    return new Response("ok", { status: 200 });
  }
});
