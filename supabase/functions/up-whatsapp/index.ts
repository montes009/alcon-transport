// up-whatsapp — Liam por WhatsApp (Cloud API de Meta).
// Webhook publico: Meta llama GET para verificar y POST con cada mensaje entrante.
// Llama a Anthropic directo (mismo patron que up-asesor) y responde por la Graph API.
// Guarda el hilo de conversacion en whatsapp_sesiones_web (aislado del ERP).
// bot_activo controla si Liam responde automatico: se apaga solo cuando un humano
// interviene desde el panel (whatsapp.html) o con el interruptor manual del panel.
//
// Cotizacion por WhatsApp: Liam tiene una herramienta (tool use) "generar_cotizacion".
// Cuando ya recogio equipo(s) + dias (+ ciudad) llama a la RPC cotizar_web (mismas
// tarifas reales que el cotizador de la web) y responde con un LINK de descarga del
// PDF (print_cotizacion.html?id=...), sin mandar archivos por WhatsApp.
import { createClient } from "jsr:@supabase/supabase-js@2";

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET"); // opcional, para verificar firma
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY_UP")!;
// Sitio donde vive print_cotizacion.html (para el link de descarga del PDF).
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://pagina-up.onrender.com").replace(/\/+$/, "");

const GRAPH_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
const MAX_HISTORY = 16;
const QUOTE_KEYWORDS = ["cotiza", "cotización", "cotizacion"];

// Config editable desde whatsapp.html (tabla liam_config_web), con estos defaults como
// respaldo si la fila no existe, activo=false, o falla la consulta (kill switch seguro).
// Solo cubren ESTILO/CONTENIDO de negocio: el flujo de datos fiscales, el uso de la
// herramienta generar_cotizacion y la capacidad de carga quedan FIJOS mas abajo, para
// que una edicion accidental desde el panel no pueda romper el flujo de cotizacion.
type LiamConfig = {
  tono: string;
  contexto_negocio: string;
  politica_precios: string;
  restricciones: string;
};

const DEFAULT_CONFIG: LiamConfig = {
  tono:
    `Español de Colombia, cálido y cercano pero profesional. Tratas de "tú" (o "usted"/"inge" si el cliente marca ese tono; sígueles el registro). Conectores naturales: "Con gusto", "te cuento que…", "listo, cuenta con eso", "buenísimo ese proyecto".
Mensajes cortos, ágiles, tipo WhatsApp (máximo 2 líneas por párrafo). Usa *negritas* para resaltar modelos y datos clave. Un emoji ocasional está bien, sin abusar.
Seguridad y autoridad: hablas como alguien que conoce los equipos. No pides permisos excesivos, aportas valor desde el primer mensaje.
Saludo inicial: si el cliente saluda o es el primer mensaje del hilo, saluda tú también con "{{SALUDO_HORA}}" y preséntate por tu nombre antes de entrar en materia. Nunca vayas directo a una pregunta de negocio sin saludar. Si el cliente ya saludó antes en la conversación y vuelve a escribir un saludo corto, reconócelo con calidez ("¡Hola de nuevo! 👋") sin repetir toda la presentación.
Cierre: casi cada mensaje termina con una pregunta que avanza la venta (altura, ciudad, días, cuándo lo necesita), salvo que el cliente ya haya dado todo.`,
  contexto_negocio:
    `- *Tijeras eléctricas* (interiores, bodegas, pisos terminados): ideales para mantenimiento industrial, no manchan el piso. Modelos comunes por altura de trabajo (GS-2632 ≈ 10 m, GS-3246 ≈ 12 m, hasta ~14 m).
- *Brazos articulados* (construcción, fachadas, terrenos difíciles): Z-45 (≈16 m), Z-62 (≈19 m), Z-80 (≈26 m). Versátiles, eléctricos o diésel 4x4.
- *Unipersonales eléctricos* (espacios reducidos, centros comerciales): AWP-36S (≈11 m), GR-20 (≈7,8 m). Ligeros, pasan por puertas estándar. ⚠️ Solo para interiores; NO sirven en exteriores.
- *Telehandlers*: GTH-5519 (≈17 m de alcance), para mover materiales en obra.`,
  politica_precios:
    `En charla casual NO des precios exactos por día ni los inventes; a lo sumo una referencia aproximada en rango. El precio depende del equipo, los días y la ciudad.
Si el cliente compara con una cotización de la competencia, no descalifiques: reposiciona por valor (equipo certificado, respaldo documental, soporte) y por tramos de días (más días, mejor tarifa).`,
  restricciones:
    `Nunca digas "soy una IA", "soy un modelo de lenguaje" ni "asistente virtual". Si te cuestionan: "Soy Liam, del equipo comercial de UP Equipos. Monitoreo esta línea para darles soporte rápido."
Si te piden temas fuera de elevación industrial/construcción, corta con amabilidad y reconduce: "Ese no es mi fuerte, yo manejo netamente equipos de elevación y manlifts. ¿Tienes algún requerimiento de altura en este momento?".
No hagas listas eternas de viñetas. Si recomiendas un equipo, descríbelo en prosa; usa comparaciones solo si el cliente pide comparar dos modelos.`,
};

// deno-lint-ignore no-explicit-any
async function loadLiamConfig(supabase: any): Promise<LiamConfig> {
  try {
    const { data, error } = await supabase
      .from("liam_config_web")
      .select("tono, contexto_negocio, politica_precios, restricciones, activo")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data || data.activo === false) return DEFAULT_CONFIG;
    return {
      tono: data.tono || DEFAULT_CONFIG.tono,
      contexto_negocio: data.contexto_negocio || DEFAULT_CONFIG.contexto_negocio,
      politica_precios: data.politica_precios || DEFAULT_CONFIG.politica_precios,
      restricciones: data.restricciones || DEFAULT_CONFIG.restricciones,
    };
  } catch (e) {
    console.error("loadLiamConfig error:", e instanceof Error ? e.message : e);
    return DEFAULT_CONFIG;
  }
}

function buildSystemPrompt(cfg: LiamConfig): string {
  return `Eres Liam, comercial de UP Equipos, empresa colombiana especializada en alquiler y venta de plataformas de elevación GENIE y JLG (tijeras, brazos articulados, unipersonales y telehandlers). Atiendes por WhatsApp. No eres un contestador que da datos sueltos: eres un vendedor que perfila el proyecto, asesora técnicamente y avanza la venta hasta dejar el lead listo para cerrar.

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
${cfg.tono}

---
🏗️ CONOCIMIENTO TÉCNICO (orienta como experto)
${cfg.contexto_negocio}
- *Capacidad de carga:* 227 kg la mayoría de los equipos (2 personas + herramienta); 159 kg las unipersonales. NUNCA digas cifras distintas.

---
🧾 TIPO DE CLIENTE Y DATOS FISCALES (OBLIGATORIO ANTES DE COTIZAR)
Una cotización formal en Colombia SIEMPRE sale identificada con el cliente y su número de identificación. NUNCA generes una cotización con el NIT en blanco. Antes de generar, define si es empresa o persona natural y captura sus datos:
- *Empresa (persona jurídica):* necesitas la *razón social* (nombre legal de la empresa) y el *NIT*. Pídelo natural: "¿A nombre de qué empresa la hago? Regálame la *razón social* y el *NIT* para dejarla a nombre de ustedes."
- *Persona natural:* necesitas el *nombre completo* y la *cédula*. "¿La cotización va a tu nombre? Pásame tu *nombre completo* y tu *número de cédula*."
NO confundas el nombre del perfil de WhatsApp con la razón social: confírmalo siempre. Estos datos (NIT/razón social o cédula/nombre) los necesitas YA para cotizar. El RUT, la cámara de comercio y la cédula del representante legal se piden después, para formalizar el alquiler.

---
💰 PRECIOS Y COTIZACIÓN FORMAL
${cfg.politica_precios}
- Cuando el cliente quiera la *cotización formal* (o el "valor exacto") y ya tengas confirmados el/los *equipo(s) del catálogo*, los *días* de cada uno, los *datos fiscales del cliente* (empresa: razón social + NIT · persona natural: nombre completo + cédula) Y la *ciudad de la obra* (obligatoria: define la sede que atiende —Medellín, Bogotá o Barranquilla— y el transporte), GENERA la cotización con tu herramienta \`generar_cotizacion\`. Esa herramienta calcula las tarifas reales con IVA y te devuelve un *link de descarga del PDF* que le compartes al cliente. NO escribas los precios a mano ni intentes mandar archivos; el sistema arma todo.
- Antes de generar, confirma en una frase lo que vas a cotizar (ej: "Te armo la cotización de *1 tijera GS-3246 por 10 días*, ¿de una?").
- Si falta el equipo, los días o la ciudad, NO uses la herramienta todavía: pregúntalos primero, uno o dos datos por mensaje. La *ciudad* es imprescindible para asignar la sede.
- El *transporte* (flete) se cotiza aparte según la ciudad y NO va incluido en ese total; acláralo al entregar el link.

---
📄 CIERRE Y REQUISITOS (cuando el cliente quiere avanzar)
- Para dejar el registro listo, pide los documentos de matrícula del cliente: *RUT actualizado*, *cámara de comercio* y *cédula del representante legal*.
- Menciona que UP maneja *pago anticipado* y que el equipo va con su documentación completa (ficha técnica, hoja de vida, certificación ONAC, póliza, certificado de importación), útil sobre todo para obras exigentes.
- Si el equipo queda parado en obra, existe tarifa de *standby* equivalente al 50% del valor día. No entres en detalle de cifras salvo que lo pregunten; menciónalo solo si es relevante.

---
🚫 RESTRICCIONES
${cfg.restricciones}`;
}

// Herramienta que Claude invoca para generar la cotizacion formal.
const TOOLS = [
  {
    name: "generar_cotizacion",
    description:
      "Genera la cotización formal de alquiler con las tarifas reales (IVA incluido) y devuelve un link de descarga del PDF para enviar al cliente. Úsala SOLO cuando ya confirmaste con el cliente: el/los equipo(s) del catálogo, la cantidad y los días de alquiler de cada uno, Y los datos fiscales del cliente (empresa: razón social + NIT · persona natural: nombre completo + cédula). NUNCA la generes sin identificación (NIT o cédula). La ciudad ayuda para el transporte. No inventes precios: esta herramienta los calcula. El transporte (flete) se cotiza aparte y NO va incluido.",
    input_schema: {
      type: "object",
      properties: {
        cliente: {
          type: "object",
          description:
            "Datos fiscales del cliente para identificar la cotización (obligatorio).",
          properties: {
            tipo: {
              type: "string",
              enum: ["empresa", "natural"],
              description: "empresa (persona jurídica) o natural (persona natural).",
            },
            razon_social: {
              type: "string",
              description: "razón social / nombre legal de la empresa (si tipo=empresa).",
            },
            nombre: {
              type: "string",
              description:
                "nombre de la persona de contacto (empresa) o nombre completo (persona natural).",
            },
            nit: {
              type: "string",
              description: "NIT de la empresa (si tipo=empresa).",
            },
            cedula: {
              type: "string",
              description: "número de cédula (si tipo=natural).",
            },
            correo: { type: "string", description: "correo del cliente (opcional)." },
          },
          required: ["tipo"],
        },
        items: {
          type: "array",
          description: "Equipos a cotizar (uno o varios).",
          items: {
            type: "object",
            properties: {
              tarifa_id: {
                type: "integer",
                description: "id del equipo en el catálogo disponible (preferido).",
              },
              ref: {
                type: "string",
                description:
                  "referencia del equipo si no tienes el id (ej: 3246, Z45, AWP40).",
              },
              cantidad: {
                type: "integer",
                description: "número de unidades (mínimo 1).",
              },
              dias: { type: "integer", description: "días de alquiler." },
            },
            required: ["dias"],
          },
        },
        ciudad: {
          type: "string",
          description:
            "ciudad donde va la obra (OBLIGATORIA): define la sede que atiende (Medellín, Bogotá, Barranquilla) y el transporte.",
        },
      },
      required: ["items", "cliente", "ciudad"],
    },
  },
];

function money(v: number): string {
  return "$ " + Number(v || 0).toLocaleString("es-CO") + " COP";
}

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

// deno-lint-ignore no-explicit-any
async function loadTarifas(supabase: any): Promise<any[]> {
  const { data, error } = await supabase
    .from("tarifas_web")
    .select("id, ref, tipo, descripcion, altura_m")
    .eq("activo", true)
    .order("orden");
  if (error) {
    console.error("tarifas_web error:", error.message);
    return [];
  }
  return data ?? [];
}

// deno-lint-ignore no-explicit-any
function catalogoTexto(tarifas: any[]): string {
  if (!tarifas.length) return "";
  const filas = tarifas
    .map(
      (t) =>
        `- id ${t.id} | ${t.ref} | ${t.tipo} | ${t.altura_m} m | ${t.descripcion}`,
    )
    .join("\n");
  return `\n\n---\n📦 CATÁLOGO DISPONIBLE (usa exactamente estos equipos y su id al cotizar)\n${filas}`;
}

function normRef(s: string): string {
  return String(s || "").toLowerCase().replace(/genie/g, "").replace(/[^a-z0-9]/g, "");
}

// deno-lint-ignore no-explicit-any
function resolveTarifa(item: any, tarifas: any[]): any | null {
  if (item?.tarifa_id != null) {
    const byId = tarifas.find((t) => Number(t.id) === Number(item.tarifa_id));
    if (byId) return byId;
  }
  const r = normRef(item?.ref);
  if (r) {
    let m = tarifas.find((t) => normRef(t.ref) === r);
    if (m) return m;
    m = tarifas.find((t) => {
      const tr = normRef(t.ref);
      return tr.includes(r) || r.includes(tr);
    });
    if (m) return m;
  }
  return null;
}

// Mensaje cuando faltan los datos fiscales: pide identificacion en vez de cotizar en blanco.
function pedirDatosFiscales(head: string, tipo: string): string {
  if (tipo === "empresa") {
    return (
      head +
      "Para dejarte la cotización a nombre de la empresa necesito la *razón social* y el *NIT* 🙂. ¿Me los regalas?"
    );
  }
  if (tipo === "natural") {
    return (
      head +
      "Para armarte la cotización necesito tu *nombre completo* y tu *número de cédula* 🙂. ¿Me los pasas?"
    );
  }
  return (
    head +
    "Para dejarte la cotización formal necesito los datos de facturación 🙂. Si es *empresa*, la *razón social* y el *NIT*; si va a tu nombre, tu *nombre completo* y *cédula*."
  );
}

// Mensaje cuando falta la ciudad: la necesitamos para la sede y el transporte.
function pedirCiudad(head: string): string {
  return (
    head +
    "¿En qué *ciudad* es la obra? 🙂 La necesito para asignarte la sede que te atiende (Medellín, Bogotá o Barranquilla) y calcular el transporte."
  );
}

// Ejecuta la cotizacion (asegura cliente + cotizar_web) y arma el mensaje con el link.
// deno-lint-ignore no-explicit-any
async function generarCotizacionReply(
  supabase: any,
  tarifas: any[],
  telefono: string,
  // deno-lint-ignore no-explicit-any
  input: any,
  preamble: string,
): Promise<string> {
  const head = preamble ? preamble.trim() + "\n\n" : "";
  try {
    const items: { tarifa_id: number; cantidad: number; dias: number }[] = [];
    for (const it of input?.items ?? []) {
      const t = resolveTarifa(it, tarifas);
      if (!t) throw new Error("tarifa no resuelta: " + JSON.stringify(it));
      items.push({
        tarifa_id: Number(t.id),
        cantidad: Math.max(1, Number(it.cantidad || 1)),
        dias: Math.max(1, Number(it.dias || 1)),
      });
    }
    if (!items.length) throw new Error("sin items");

    // Datos fiscales: una cotizacion formal NUNCA sale con el NIT/cedula en blanco.
    const c = input?.cliente ?? {};
    const tipo = String(c.tipo || "").toLowerCase();
    const razon = String(c.razon_social || "").trim();
    const nombrePersona = String(c.nombre || "").trim();
    const ident = String(c.nit || c.cedula || "").trim(); // NIT (empresa) o cedula (natural)

    let pNombre: string;
    let pEmpresa: string | null;
    if (tipo === "empresa") {
      if (!razon || !ident) return pedirDatosFiscales(head, "empresa");
      pEmpresa = razon;
      pNombre = nombrePersona || razon;
    } else if (tipo === "natural") {
      if (!nombrePersona || !ident) return pedirDatosFiscales(head, "natural");
      pEmpresa = null;
      pNombre = nombrePersona;
    } else {
      return pedirDatosFiscales(head, "");
    }

    // Ciudad obligatoria: define la sede que atiende y el transporte. No cotizar sin ella.
    const ciudad = String(input?.ciudad || "").trim();
    if (!ciudad) return pedirCiudad(head);

    // Asegura el cliente (upsert por telefono/NIT) con sus datos fiscales.
    const { data: cli, error: cliErr } = await supabase.rpc("crear_cliente_web", {
      p_nombre: pNombre,
      p_telefono: telefono,
      p_correo: c.correo || null,
      p_ciudad: ciudad,
      p_empresa: pEmpresa,
      p_nit: ident,
    });
    if (cliErr) throw new Error("crear_cliente_web: " + cliErr.message);
    const clienteId = (cli && cli.id) || (typeof cli === "string" ? cli : null);
    if (!clienteId) throw new Error("sin cliente_web_id");

    const { data: cot, error: cotErr } = await supabase.rpc("cotizar_web", {
      p_cliente_web_id: clienteId,
      p_items: items,
      p_ciudad: ciudad,
      p_mensaje: "Cotización generada por Liam (WhatsApp)",
    });
    if (cotErr) throw new Error("cotizar_web: " + cotErr.message);
    if (!cot || !cot.ok) throw new Error("cotizar_web sin ok");

    const link = `${SITE_URL}/print_cotizacion.html?id=${encodeURIComponent(cot.id)}&print=1`;
    const lineas = (cot.items ?? [])
      .map(
        // deno-lint-ignore no-explicit-any
        (x: any) => `• ${x.cantidad} × ${x.ref} (${x.tipo} ${x.altura_m}m) · ${x.dias} días`,
      )
      .join("\n");

    return (
      `${head}✅ *Cotización ${cot.nro}*\n` +
      `${lineas}\n` +
      `*Total: ${money(cot.total)}* (IVA incluido)\n\n` +
      `⬇ Descárgala en PDF aquí:\n${link}\n\n` +
      (cot.sede ? `📍 Te atiende nuestra *sede ${cot.sede}*.\n` : "") +
      `El *transporte* se cotiza aparte según la ciudad. Guarda tu número *${cot.nro}* para consultarla luego. ¿Te la reviso con un asesor o necesitas algo más? 🙂`
    );
  } catch (e) {
    console.error("generarCotizacion error:", e instanceof Error ? e.message : e);
    return (
      head +
      "Uy, se me presentó un inconveniente generando la cotización en el sistema 😕. ¿Me confirmas el *equipo* y los *días* para reintentar, o prefieres que te comunique con un asesor?"
    );
  }
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
        clienteWebId = (rpcData && rpcData.id) || (typeof rpcData === "string" ? rpcData : null);
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
      // Catalogo real (para elegir equipo y para resolver la herramienta de cotizacion).
      const tarifas = await loadTarifas(supabase);
      const liamConfig = await loadLiamConfig(supabase);
      const systemFinal =
        buildSystemPrompt(liamConfig).replaceAll("{{SALUDO_HORA}}", saludoActual()) +
        catalogoTexto(tarifas);

      const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: systemFinal,
          tools: TOOLS,
          messages: historial.map(({ role, content }) => ({ role, content })),
        }),
      });
      const aiData = await aiResp.json();
      if (!aiResp.ok || !aiData.content) {
        console.error("Anthropic error:", JSON.stringify(aiData));
        reply = "Disculpa, tuve un problema tecnico. ¿Puedes repetir tu mensaje?";
      } else {
        // deno-lint-ignore no-explicit-any
        const blocks: any[] = aiData.content;
        const preamble = blocks
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        const toolUse = blocks.find(
          (b) => b.type === "tool_use" && b.name === "generar_cotizacion",
        );
        if (toolUse) {
          reply = await generarCotizacionReply(
            supabase,
            tarifas,
            from,
            toolUse.input,
            preamble,
          );
          leadCaptured = true; // al cotizar, el lead queda capturado si o si
        } else {
          reply = preamble || "¿Me cuentas un poco más de lo que necesitas? 🙂";
        }
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
