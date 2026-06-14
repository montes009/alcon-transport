// up-cotizar — Liam (asesor web) genera una cotizacion estimada y la guarda
// en public.cotizaciones_web (tabla AISLADA del ERP Alcon OPS).
// Pagina de impresion: print_cotizacion.html?id=<id>
//
// AJUSTA AQUI las tarifas base (COP/dia). Total = ESTIMADO sujeto a confirmacion.
// Deploy: supabase functions deploy up-cotizar  (o via MCP/Studio)
import { createClient } from "jsr:@supabase/supabase-js@2";

const IVA_PCT = 19;

const TARIFAS: Record<string, number> = {
  tijera_electrica: 180000,
  tijera_diesel:    260000,
  brazo_articulado: 420000,
  telescopico:      650000,
  telehandler:      520000,
  camion_grua:      900000,
};
const LABELS: Record<string, string> = {
  tijera_electrica: "Tijera Eléctrica",
  tijera_diesel:    "Tijera Diésel",
  brazo_articulado: "Brazo Articulado",
  telescopico:      "Brazo Telescópico",
  telehandler:      "Telehandler",
  camion_grua:      "Camión Grúa",
};

function factorAltura(alt: number): number {
  if (!alt || alt <= 0) return 1;
  if (alt <= 10) return 1;
  if (alt <= 16) return 1.25;
  if (alt <= 24) return 1.6;
  if (alt <= 32) return 2.1;
  return 2.6;
}
function factorDias(dias: number): number {
  if (dias >= 30) return 0.72;
  if (dias >= 15) return 0.82;
  if (dias >= 7)  return 0.9;
  return 1;
}
function normalizaTipo(tipo = "", subtipo = ""): string {
  const t = (subtipo + " " + tipo).toLowerCase();
  if (t.includes("telehandler")) return "telehandler";
  if (t.includes("camion") || t.includes("grúa") || t.includes("grua")) return "camion_grua";
  if (t.includes("telesc")) return "telescopico";
  if (t.includes("brazo") || t.includes("articulado") || t.includes("boom")) return "brazo_articulado";
  if (t.includes("diesel") || t.includes("diésel")) return "tijera_diesel";
  if (t.includes("tijera") || t.includes("scissor")) return "tijera_electrica";
  return "tijera_electrica";
}
function genId(): string {
  return "web" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const dias = Math.max(1, parseInt(body.dias) || 1);
    const altura = parseFloat(body.altura_m) || 0;
    const key = normalizaTipo(body.tipo_equipo, body.subtipo);
    const base = TARIFAS[key] ?? TARIFAS.tijera_electrica;

    const precioDia = Math.round(base * factorAltura(altura) * factorDias(dias) / 1000) * 1000;
    const subtotal = precioDia * dias;
    const totalIva = Math.round(subtotal * IVA_PCT / 100);
    const totalConIva = subtotal + totalIva;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { count } = await supabase
      .from("cotizaciones_web")
      .select("id", { count: "exact", head: true });
    const nro = "COT-W" + String((count ?? 0) + 1).padStart(4, "0");

    const id = genId();
    const { error } = await supabase.from("cotizaciones_web").insert({
      id,
      nro,
      cliente: body.empresa_cliente || body.nombre || "Cliente Web",
      contacto: body.nombre ?? null,
      telefono: body.telefono ?? null,
      correo: body.correo ?? null,
      ciudad: body.ciudad ?? null,
      tipo: LABELS[key],
      subtipo: key,
      altura: altura ? `${altura} m` : null,
      modalidad: "alquiler_dia",
      dias,
      precio: precioDia,
      iva_pct: IVA_PCT,
      subtotal,
      total_iva: totalIva,
      total_con_iva: totalConIva,
      obs: body.mensaje ?? null,
      estado: "nueva",
      origen: "web",
      utm_source: body.utm_source ?? null,
      utm_campaign: body.utm_campaign ?? null,
      page_url: body.page_url ?? null,
    });
    if (error) throw error;

    return new Response(JSON.stringify({
      ok: true,
      id, nro,
      tipo: LABELS[key],
      precio_dia: precioDia,
      dias, subtotal,
      iva: totalIva,
      total: totalConIva,
      moneda: "COP",
      nota: "Valor estimado sujeto a confirmacion del equipo comercial.",
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
