// up-cotizar — Liam (asesor web). Cotiza con TARIFAS 2 (tabla tarifas_web).
// El cliente ya fue creado por up-cliente (se recibe cliente_web_id).
// Guarda en cotizaciones_web. Todo AISLADO del ERP Alcon OPS.
// Tarifas SIN IVA -> se suma 19%. Pagina: print_cotizacion.html?id=<id>
import { createClient } from "jsr:@supabase/supabase-js@2";

const IVA_PCT = 19;

const OBSERVACIONES = [
  "El combustible es por parte del cliente. El equipo se entrega con 1/4 de tanque y debe ser devuelto con el mismo nivel. Galón ACPM $18.000 + IVA.",
  "Stand by transporte: $150.000/hora (si en obra nos hacen esperar).",
  "Operador: Barranquilla $305.000 · alrededores $350.000 · fuera del Atlántico $380.000 (día de 8 horas).",
  "Hora extra (después de 8 horas) $40.275 · Hora nocturna (8pm-6am) $50.525 · Hora dominical o festiva $55.465 · Hora nocturna en festivo / extra nocturna $55.685.",
  "Fuera de Barranquilla se deben sumar viáticos.",
].map((o) => "• " + o).join("\n");

function tarifaPorDias(t: any, dias: number): number {
  if (dias >= 30 && t.tarifa_mes) return Math.round(Number(t.tarifa_mes) / 30);
  if (dias >= 16) return Number(t.tarifa_16mas);
  if (dias >= 4)  return Number(t.tarifa_4_15);
  return Number(t.tarifa_1_3);
}
function tramoLabel(dias: number): string {
  if (dias >= 30) return "Tarifa mes";
  if (dias >= 16) return "Más de 16 días";
  if (dias >= 4)  return "4 a 15 días";
  return "1 a 3 días";
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Tarifa elegida
    let tarifa: any = null;
    if (body.tarifa_id) {
      const { data } = await supabase.from("tarifas_web").select("*").eq("id", body.tarifa_id).maybeSingle();
      tarifa = data;
    }
    if (!tarifa && body.ref) {
      const { data } = await supabase.from("tarifas_web").select("*").eq("ref", body.ref).maybeSingle();
      tarifa = data;
    }
    if (!tarifa) throw new Error("Tarifa no encontrada. Selecciona un equipo del catálogo.");

    const precioDia = tarifaPorDias(tarifa, dias);
    const subtotal = precioDia * dias;
    const totalIva = Math.round(subtotal * IVA_PCT / 100);
    const totalConIva = subtotal + totalIva;

    // ---- Cliente: usar el creado por up-cliente; si no, crear por telefono ----
    let clienteWebId: string | null = body.cliente_web_id || null;
    let cli: any = null;
    const ahora = new Date().toISOString();

    if (clienteWebId) {
      const { data } = await supabase.from("clientes_web").select("*").eq("id", clienteWebId).maybeSingle();
      cli = data;
      if (cli) {
        await supabase.from("clientes_web").update({
          total_cotizaciones: (cli.total_cotizaciones || 0) + 1,
          ultima_cotizacion: ahora,
        }).eq("id", clienteWebId);
      } else {
        clienteWebId = null;
      }
    }
    if (!clienteWebId) {
      const telefono = (body.telefono || "").replace(/[^\d+]/g, "") || null;
      if (telefono) {
        const { data: existente } = await supabase
          .from("clientes_web").select("id,total_cotizaciones").eq("telefono", telefono).maybeSingle();
        if (existente) {
          clienteWebId = existente.id;
          await supabase.from("clientes_web").update({
            nombre: body.nombre ?? null, correo: body.correo ?? null, ciudad: body.ciudad ?? null,
            total_cotizaciones: (existente.total_cotizaciones || 0) + 1, ultima_cotizacion: ahora,
          }).eq("id", existente.id);
        } else {
          const { data: nuevo } = await supabase.from("clientes_web").insert({
            nombre: body.nombre ?? null, telefono, correo: body.correo ?? null, ciudad: body.ciudad ?? null,
            total_cotizaciones: 1, primera_cotizacion: ahora, ultima_cotizacion: ahora,
          }).select("id").single();
          clienteWebId = nuevo?.id ?? null;
        }
      }
    }

    const nombre = cli?.nombre || body.nombre || null;
    const telefono = cli?.telefono || ((body.telefono || "").replace(/[^\d+]/g, "") || null);
    const correo = cli?.correo || body.correo || null;
    const ciudad = body.ciudad || cli?.ciudad || null;
    const empresa = cli?.empresa || body.empresa_cliente || null;
    const nit = cli?.nit || body.nit || null;

    // ---- Numeracion y guardado ----
    const { count } = await supabase.from("cotizaciones_web").select("id", { count: "exact", head: true });
    const nro = "COT-W" + String((count ?? 0) + 1).padStart(4, "0");
    const id = genId();
    const equipoLabel = `${tarifa.ref} · ${tarifa.tipo} ${tarifa.altura_m}m (${tarifa.descripcion})`;

    const { error } = await supabase.from("cotizaciones_web").insert({
      id, nro,
      cliente: empresa || nombre || "Cliente Web",
      contacto: nombre,
      telefono, correo, ciudad, nit,
      cliente_web_id: clienteWebId,
      tipo: equipoLabel,
      subtipo: tarifa.tipo,
      altura: tarifa.altura_m ? `${tarifa.altura_m} m` : null,
      modalidad: "alquiler_dia",
      dias,
      precio: precioDia,
      iva_pct: IVA_PCT,
      subtotal,
      total_iva: totalIva,
      total_con_iva: totalConIva,
      obs: body.mensaje ?? null,
      observaciones: OBSERVACIONES,
      estado: "nueva",
      origen: "web",
      utm_source: body.utm_source ?? null,
      utm_campaign: body.utm_campaign ?? null,
      page_url: body.page_url ?? null,
    });
    if (error) throw error;

    return new Response(JSON.stringify({
      ok: true, id, nro,
      cliente_web_id: clienteWebId,
      tipo: equipoLabel,
      tramo: tramoLabel(dias),
      precio_dia: precioDia,
      dias, subtotal,
      iva: totalIva,
      total: totalConIva,
      moneda: "COP",
      observaciones: OBSERVACIONES,
      nota: "Valor estimado + IVA, sujeto a confirmacion del equipo comercial.",
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
