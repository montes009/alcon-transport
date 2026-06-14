# CLAUDE.md — UP Equipos (pagina_up)

Memoria del proyecto. Sitio web público de **UP Equipos S.A.S.** (alquiler/venta de
plataformas elevadoras GENIE en Colombia: Medellín, Bogotá, Barranquilla).

## Despliegue / Git
- **Hosting:** Render. **Despliega desde la rama `main`** (no desde otras ramas).
- Rama de desarrollo de esta sesión: `claude/peaceful-wright-3frdsq`. Para que algo
  salga en vivo hay que **fusionar a `main` y pushear**.
- Sitio en vivo: `https://pagina-up.onrender.com/`. Dominio definitivo previsto: `equiposup.com`.
- Es un sitio estático (HTML/CSS/JS en la raíz): `index.html`, `css/`, `js/`, `imagenes/`,
  `print_cotizacion.html`, `sitemap.xml`, `robots.txt`, `seo/`, `analytics/`.

## Supabase
- Proyecto: **OPS-ALCON-ADMI**, ref `oguxdohmutqgacahcwop`.
- URL: `https://oguxdohmutqgacahcwop.supabase.co`. La anon key vive en `js/config.js`
  (pública por diseño; la seguridad va por RLS).
- ⚠️ El deploy de Edge Functions vía MCP puede quedar bloqueado por aprobación. Si pasa,
  alternativas: `supabase functions deploy <fn> --project-ref oguxdohmutqgacahcwop`,
  Supabase Studio, o resolver la lógica con SQL (RPC/trigger vía apply_migration, que sí
  suele estar permitido).

## AISLAMIENTO CRÍTICO: web vs ERP Alcon OPS
La misma base de datos contiene el **ERP multiempresa Alcon OPS** (tablas `cotizaciones`,
`clientes`, `maquinas`, `empresas`, etc., con `empresa_id`). **La web NO debe leer ni
escribir esas tablas del ERP, y el ERP no debe leer las de la web.** Todo lo de la web
vive en tablas propias con sufijo `_web`.
- UP Equipos en el ERP = `empresa_id` `23041bf0-04b0-4611-98ed-ebc567585393` (solo referencia).

## Asistente "Liam" (chat del sitio)
- Frontend: `js/assistant.js` (UPAssistant). Llama a la Edge Function **`up-asesor`**
  (Claude `claude-sonnet-4-6`, system prompt con personalidad y política de precios).
  La API key de Anthropic está en el secret `ANTHROPIC_API_KEY_UP`.
- **Política de precios (importante):**
  - Preguntas casuales de precio → Liam da **solo aproximaciones en rangos**, nunca tarifas reales.
  - Solo al **pedir una cotización** se entregan **valores reales** (vía el módulo de cotizaciones).
- El módulo de cotizaciones (`js/cotizador.js`, objeto `UPCotizador`) se carga en `index.html`
  ANTES de `assistant.js`.

## Módulo de cotizaciones (Liam cotiza)
Flujo (todo en el chat):
1. Usuario pide cotizar → `assistant.js` detecta la intención (`UPCotizador.isQuoteRequest`)
   **antes** de llamar a la API e inicia `UPCotizador.start()` (arranque determinista).
2. **Formulario "Crear cliente"** (primero el cliente, para capturar el lead aunque no termine):
   Nombre*, Teléfono/WhatsApp*, Ciudad, Correo (opc.), Empresa (opc.), **NIT (opc.)**.
   - Al enviar llama a la **RPC `crear_cliente_web`** (NO a una Edge Function) →
     `POST {supabaseUrl}/rest/v1/rpc/crear_cliente_web` con la anon key. Devuelve el `uuid`.
3. Elegir **equipo** (chips cargados desde `tarifas_web`) → escribir **días**.
4. Genera la cotización con la Edge Function **`up-cotizar`** → inserta en `cotizaciones_web`,
   enlaza `cliente_web_id`, incrementa el contador del cliente, calcula por tramo de días + IVA.
5. Muestra tarjeta con total + **N° `COT-Wxxxx`** + observaciones, y un **botón fijo abajo**
   del chat que pasa de gris "Generando..." a verde "⬇ Descargar cotización".
6. El botón abre `print_cotizacion.html?id=<id>&print=1` (PDF imprimible).
   - Reconsulta posterior: `print_cotizacion.html?nro=COT-Wxxxx` (acepta `?id=` o `?nro=`).

### Tablas web (aisladas del ERP)
- **`cotizaciones_web`**: cotizaciones generadas en el sitio. `id` (text, generado en la fn),
  `nro` (`COT-Wxxxx`), cliente/contacto/telefono/correo/ciudad/**nit**, `cliente_web_id`,
  tipo/subtipo/altura/dias/precio, `iva_pct`/subtotal/total_iva/total_con_iva,
  `observaciones`, `obs`, `estado`('nueva'), `origen`('web'), `cliente_web_id`.
  - RLS: **lectura anon permitida solo en esta tabla** (para el PDF). Escritura solo service_role.
- **`clientes_web`**: CRM de leads. `id` uuid, nombre, **telefono UNIQUE** (dedup), correo,
  ciudad, empresa, **nit**, `total_cotizaciones`, primera/ultima_cotizacion.
  - RLS: sin policies para anon (solo service_role / RPC SECURITY DEFINER escriben/leen).
- **`tarifas_web`** (TARIFAS 2): catálogo que alimenta el cotizador. Por tramos de días,
  valores **SIN IVA** (la fn suma 19%). Columnas: ref, tipo, descripcion, altura_m,
  `tarifa_1_3`, `tarifa_4_15`, `tarifa_16mas`, `tarifa_mes`, activo, orden.
  - RLS: lectura anon permitida (para poblar el dropdown). Editable desde Studio sin tocar código.
  - Tramos: 1-3 → `tarifa_1_3`/día; 4-15 → `tarifa_4_15`; 16-29 → `tarifa_16mas`;
    ≥30 → `tarifa_mes`/30. **Las 10 referencias GENIE están cargadas** (AWP40, 2632, 3246,
    4047, Z34, Z40, Z45, Z60, Z80, ZX135).

### Objetos SQL de apoyo (para evitar depender del deploy de funciones)
- **RPC `crear_cliente_web(p_nombre,p_telefono,p_correo,p_ciudad,p_empresa,p_nit)`**:
  SECURITY DEFINER, upsert por teléfono, devuelve uuid. `execute` concedido a anon. Es lo
  que usa el formulario para crear/actualizar el cliente con NIT sin Edge Function.
- **Trigger `trg_cotweb_fill_nit`** (fn `cotweb_fill_nit`) BEFORE INSERT en `cotizaciones_web`:
  si la fila no trae `nit` y tiene `cliente_web_id`, copia el NIT desde `clientes_web`.

### Edge Functions
- **`up-asesor`** (v9, verify_jwt=false): chat de Liam con Claude + política de precios.
- **`up-cotizar`** (verify_jwt=true): genera la cotización (tarifas por tramo + IVA),
  guarda en `cotizaciones_web`, enlaza/actualiza el cliente. Código en
  `supabase/functions/up-cotizar/index.ts`.
- **`up-cliente`** (verify_jwt=true): crea/actualiza cliente. **Quedó suplantada por la RPC
  `crear_cliente_web`** (el frontend usa la RPC). Se conserva en el repo por si se reactiva.
- Las tarifas reales y observaciones (combustible 1/4 tanque, stand by transporte,
  operador, horas extra/nocturnas/festivos, viáticos) están **hardcodeadas en `up-cotizar`**
  como constante `OBSERVACIONES` y se guardan en cada cotización.

## Open Graph / miniatura WhatsApp
- Las metaetiquetas OG/Twitter en `index.html` deben apuntar al **dominio donde está alojado
  el sitio** (`pagina-up.onrender.com`), si no WhatsApp no carga la miniatura. Imagen:
  `imagenes/og-image.png` (1200x630). WhatsApp/Facebook cachean: usar el debugger de Facebook
  ("Scrape Again") o un `?v=N` para forzar refresco.

## Config frontend (`js/config.js`)
`window.UP_CONFIG`: `supabaseUrl`, `anonKey`, `edgeFunctionUrl` (up-asesor),
`cotizarUrl` (up-cotizar), `clienteUrl` (up-cliente, ya no se usa: se reemplazó por la RPC),
`whatsappComercial` (número del comercial para los botones de WhatsApp, formato 57XXXXXXXXXX).

## Pendientes / notas
- Ajustar `whatsappComercial` si cambia el número comercial.
- Editar tarifas → tabla `tarifas_web` en Studio (no requiere código).
- Hay una cotización de prueba real: **COT-W0001** (cliente "ORLANDO ABAD MONTES").
  Borrarla si se quiere dejar limpio.
- Las funciones `up-cliente`/`up-cotizar` del repo pueden estar más nuevas que las desplegadas
  si el deploy quedó bloqueado; el NIT ya funciona vía RPC + trigger sin necesidad de redeploy.
