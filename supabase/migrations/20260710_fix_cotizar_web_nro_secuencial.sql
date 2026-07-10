-- Fix: cotizar_web generaba el numero de cotizacion con count(*)+1, que colisiona
-- con la clave unica cotizaciones_web_nro_key en cuanto se borra una fila (deja un
-- hueco: count baja pero el max se mantiene). Sintoma: al generar una cotizacion
-- (web o WhatsApp via up-whatsapp) saltaba "duplicate key value violates unique
-- constraint cotizaciones_web_nro_key" y el usuario veia el mensaje de error.
--
-- Ahora el nro se calcula como max(numero)+1 y la insercion se hace con reintento
-- ante unique_violation (robusto a borrados y a inserciones concurrentes).
CREATE OR REPLACE FUNCTION public.cotizar_web(p_cliente_web_id uuid, p_items jsonb, p_ciudad text, p_mensaje text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  it jsonb;
  v_tar record;
  v_dias int; v_cant int; v_precio_dia numeric; v_line numeric;
  v_subtotal numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_iva numeric; v_total numeric;
  v_nro text; v_id text; v_cli record;
  v_obs text;
  v_next int;
  v_try int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay equipos para cotizar';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_tar from tarifas_web where id = (it->>'tarifa_id')::int and activo;
    if not found then raise exception 'Tarifa no encontrada: %', it->>'tarifa_id'; end if;
    v_dias := greatest(1, coalesce((it->>'dias')::int, 1));
    v_cant := greatest(1, coalesce((it->>'cantidad')::int, 1));
    v_precio_dia := case
      when v_dias >= 30 and v_tar.tarifa_mes is not null then round(v_tar.tarifa_mes / 30)
      when v_dias >= 16 then v_tar.tarifa_16mas
      when v_dias >= 4  then v_tar.tarifa_4_15
      else v_tar.tarifa_1_3 end;
    v_line := v_precio_dia * v_dias * v_cant;
    v_subtotal := v_subtotal + v_line;
    v_items := v_items || jsonb_build_object(
      'ref', v_tar.ref, 'tipo', v_tar.tipo, 'descripcion', v_tar.descripcion,
      'altura_m', v_tar.altura_m, 'cantidad', v_cant, 'dias', v_dias,
      'precio_dia', v_precio_dia, 'subtotal', v_line,
      'label', v_tar.ref || ' · ' || v_tar.tipo || ' ' || v_tar.altura_m || 'm (' || v_tar.descripcion || ')'
    );
  end loop;

  v_iva := round(v_subtotal * 0.19);
  v_total := v_subtotal + v_iva;

  v_obs :=
    '• El combustible es por parte del cliente. El equipo se entrega con 1/4 de tanque y debe ser devuelto con el mismo nivel. Galón ACPM $18.000 + IVA.' || chr(10) ||
    '• Stand by transporte: $150.000/hora (si en obra nos hacen esperar).' || chr(10) ||
    '• Operador: Barranquilla $305.000 · alrededores $350.000 · fuera del Atlántico $380.000 (día de 8 horas).' || chr(10) ||
    '• Hora extra (después de 8 horas) $40.275 · Hora nocturna (8pm-6am) $50.525 · Hora dominical o festiva $55.465 · Hora nocturna en festivo / extra nocturna $55.685.' || chr(10) ||
    '• Fuera de Barranquilla se deben sumar viáticos.';

  select * into v_cli from clientes_web where id = p_cliente_web_id;

  -- Numero secuencial robusto: max(numero)+1, con reintento ante colision de nro.
  for v_try in 1..8 loop
    select coalesce(max((substring(nro from 6))::int), 0) + 1
      into v_next
      from cotizaciones_web
      where nro ~ '^COT-W[0-9]+$';
    v_nro := 'COT-W' || lpad(v_next::text, 4, '0');
    v_id := 'web' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);

    begin
      insert into cotizaciones_web(
        id, nro, cliente, contacto, telefono, correo, ciudad, nit, cliente_web_id,
        tipo, subtipo, altura, modalidad, dias, precio, iva_pct, subtotal, total_iva, total_con_iva,
        items_json, obs, observaciones, estado, origen
      ) values (
        v_id, v_nro,
        coalesce(v_cli.empresa, v_cli.nombre, 'Cliente Web'), v_cli.nombre, v_cli.telefono, v_cli.correo,
        coalesce(p_ciudad, v_cli.ciudad), v_cli.nit, p_cliente_web_id,
        case when jsonb_array_length(v_items) = 1 then (v_items->0->>'label')
             else jsonb_array_length(v_items) || ' equipos' end,
        (v_items->0->>'tipo'),
        (v_items->0->>'altura_m') || ' m',
        'alquiler_dia',
        (v_items->0->>'dias')::int,
        (v_items->0->>'precio_dia')::numeric,
        19, v_subtotal, v_iva, v_total,
        v_items::text, p_mensaje, v_obs, 'nueva', 'web'
      );
      exit; -- insercion exitosa
    exception when unique_violation then
      if v_try >= 8 then raise; end if;
      -- otro proceso tomo ese nro; reintenta con el siguiente
    end;
  end loop;

  if p_cliente_web_id is not null then
    update clientes_web set total_cotizaciones = coalesce(total_cotizaciones,0) + 1,
      ultima_cotizacion = now() where id = p_cliente_web_id;
  end if;

  return json_build_object('ok', true, 'id', v_id, 'nro', v_nro,
    'subtotal', v_subtotal, 'iva', v_iva, 'total', v_total, 'items', v_items);
end;$function$;
