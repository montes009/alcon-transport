// whatsapp-panel — backend del panel de auditoria/intervencion de Liam WhatsApp (whatsapp.html).
// Mismo patron de autenticacion que panel-web: clave contra web_panel_config +
// rate-limit de intentos fallidos por IP en panel_web_login_attempts.
// Acciones: list (listar sesiones), toggle_bot (pausar/reanudar a Liam), send (responder
// manualmente por WhatsApp; al enviar, pausa el bot automaticamente en esa conversacion),
// get_config / save_config (config editable del prompt de Liam en liam_config_web).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const MAX_FALLOS = 10;   // por IP
const VENTANA_MIN = 15;  // minutos

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const GRAPH_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

async function sendWhatsApp(to: string, body: string): Promise<boolean> {
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
  if (!resp.ok) console.error("WhatsApp send error:", await resp.text());
  return resp.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* body vacio */ }
  const clave = (body?.clave ?? "").toString();
  const action = (body?.action ?? "list").toString();

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconocida";

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rate-limit: max MAX_FALLOS intentos fallidos por IP en VENTANA_MIN.
  const desde = new Date(Date.now() - VENTANA_MIN * 60 * 1000).toISOString();
  const { count } = await sb
    .from("panel_web_login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip).eq("exito", false).gte("created_at", desde);
  if ((count ?? 0) >= MAX_FALLOS) {
    return json({ error: "Demasiados intentos. Espera unos minutos." }, 429);
  }

  if (!clave) return json({ error: "Clave requerida" }, 400);

  const { data: claveOk, error: claveErr } = await sb.rpc("web_panel_check_clave", { p_clave: clave });
  if (claveErr || !claveOk) {
    await sb.from("panel_web_login_attempts").insert({ ip, exito: false });
    return json({ error: "Clave invalida" }, 401);
  }

  if (action === "list") {
    const { data, error } = await sb
      .from("whatsapp_sesiones_web")
      .select("telefono, nombre, historial, lead_captured, bot_activo, cliente_web_id, updated_at")
      .order("updated_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ sesiones: data });
  }

  if (action === "toggle_bot") {
    const telefono = (body?.telefono ?? "").toString();
    const activo = !!body?.activo;
    if (!telefono) return json({ error: "Telefono requerido" }, 400);
    const { error } = await sb
      .from("whatsapp_sesiones_web")
      .update({ bot_activo: activo })
      .eq("telefono", telefono);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "send") {
    const telefono = (body?.telefono ?? "").toString();
    const mensaje = (body?.mensaje ?? "").toString().trim();
    if (!telefono || !mensaje) return json({ error: "Telefono y mensaje requeridos" }, 400);

    const { data: sesion } = await sb
      .from("whatsapp_sesiones_web")
      .select("historial")
      .eq("telefono", telefono)
      .maybeSingle();

    const historial = sesion?.historial ?? [];
    historial.push({ role: "assistant", content: mensaje, origen: "humano", ts: new Date().toISOString() });

    const sentOk = await sendWhatsApp(telefono, mensaje);
    if (!sentOk) return json({ error: "No se pudo enviar el mensaje por WhatsApp" }, 502);

    const { error } = await sb.from("whatsapp_sesiones_web").upsert({
      telefono,
      historial,
      bot_activo: false,
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // Config editable del prompt de Liam (tabla liam_config_web, fila unica id=1).
  // Solo tono/contexto de negocio/politica de precios/restricciones: lo estructural
  // (flujo de datos fiscales, uso de la herramienta de cotizar, capacidad de carga)
  // queda fijo en up-whatsapp/index.ts y no se expone aqui.
  if (action === "get_config") {
    const { data, error } = await sb
      .from("liam_config_web")
      .select("tono, contexto_negocio, politica_precios, restricciones, activo, updated_by, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ config: data });
  }

  if (action === "save_config") {
    const tono = (body?.tono ?? "").toString();
    const contexto_negocio = (body?.contexto_negocio ?? "").toString();
    const politica_precios = (body?.politica_precios ?? "").toString();
    const restricciones = (body?.restricciones ?? "").toString();
    const activo = body?.activo !== false;
    const updated_by = (body?.updated_by ?? "").toString().trim() || null;
    const { error } = await sb.from("liam_config_web").upsert({
      id: 1,
      tono,
      contexto_negocio,
      politica_precios,
      restricciones,
      activo,
      updated_by,
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Accion invalida" }, 400);
});
