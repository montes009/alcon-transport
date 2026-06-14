// up-cliente — crea o actualiza un cliente web (CRM clientes_web) desde el
// formulario del asesor Liam, ANTES de generar la cotizacion.
// Dedup por telefono. AISLADO del ERP Alcon OPS.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const nombre = (body.nombre || "").trim() || null;
    const telefono = (body.telefono || "").replace(/[^\d+]/g, "") || null;
    const correo = (body.correo || "").trim() || null;
    const ciudad = (body.ciudad || "").trim() || null;
    const empresa = (body.empresa || "").trim() || null;

    if (!nombre) throw new Error("El nombre es obligatorio.");
    if (!telefono || telefono.length < 7) throw new Error("El telefono es obligatorio y debe ser valido.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ahora = new Date().toISOString();
    const { data: existente } = await supabase
      .from("clientes_web").select("id").eq("telefono", telefono).maybeSingle();

    let id: string;
    let creado = false;
    if (existente) {
      id = existente.id;
      await supabase.from("clientes_web").update({
        nombre, correo, ciudad, empresa, ultima_cotizacion: ahora,
      }).eq("id", id);
    } else {
      const { data: nuevo, error } = await supabase.from("clientes_web").insert({
        nombre, telefono, correo, ciudad, empresa,
        total_cotizaciones: 0,
        primera_cotizacion: ahora, ultima_cotizacion: ahora,
      }).select("id").single();
      if (error) throw error;
      id = nuevo.id;
      creado = true;
    }

    return new Response(JSON.stringify({ ok: true, cliente_web_id: id, creado }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
