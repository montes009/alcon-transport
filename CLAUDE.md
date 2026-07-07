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

## Liam por WhatsApp (Cloud API de Meta) — PRUEBA funcionando, falta pasar a número definitivo

Objetivo: que Liam atienda por WhatsApp real (no solo el chat de la web), usando **Claude
directo desde una Edge Function** (sin n8n, sin costo de plataforma extra — solo se paga
Anthropic por uso y Meta por conversación, que es gratis cuando el cliente escribe primero).

### Arquitectura
- **Edge Function `up-whatsapp`** (verify_jwt=false, es un webhook público de Meta):
  - `GET` → verificación del webhook (Meta manda `hub.mode`/`hub.verify_token`/`hub.challenge`).
  - `POST` → mensaje entrante: llama a Anthropic (mismo patrón que `up-asesor`, modelo
    `claude-sonnet-4-6`) y responde por la **Graph API de WhatsApp**
    (`https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`).
  - Guarda el hilo de conversación en la tabla **`whatsapp_sesiones_web`** (aislada del ERP,
    igual que las demás `_web`): `telefono` (PK), `historial` jsonb, `lead_captured` bool,
    `cliente_web_id`, `updated_at`. Sin esto Liam no tendría memoria entre mensajes.
  - Al pedir **cotización** (detecta "cotiza"/"cotización"/"cotizar"), llama a la RPC
    **`crear_cliente_web`** para capturar el lead automáticamente (mismo CRM `clientes_web`
    que usa el cotizador web) — no genera la cotización completa todavía, solo captura el
    contacto y pide los datos que falten (equipo, días, ciudad) para que el comercial cierre.
  - Verificación de firma HMAC opcional vía secret `WHATSAPP_APP_SECRET` (si no está seteado,
    se omite — no es obligatorio para que funcione).

### Secrets configurados (Supabase Studio → Edge Functions → Secrets)
- `WHATSAPP_TOKEN`: token de acceso de la API de WhatsApp. ⚠️ **El generado en modo prueba
  dura 24h** — para producción hay que generar un **token permanente de sistema** (System User
  token en Meta Business Suite, sin expiración) y actualizarlo aquí.
- `WHATSAPP_PHONE_NUMBER_ID`: ID del número (el de prueba actual: `1284617354725165`).
- `WHATSAPP_VERIFY_TOKEN`: palabra clave inventada (`up-liam-verify-2026`) que se repite
  también en la config del webhook en Meta.
- Reutiliza `ANTHROPIC_API_KEY_UP` (ya existente, misma key que `up-asesor`).

### App de Meta usada para las pruebas
- App **"vmaquinas"** (developers.facebook.com), bajo el portfolio comercial **Vehimaquinas**
  (NO Up Equipos — ese portfolio quedó bloqueado por Meta para publicidad/apps; pendiente
  apelar esa restricción si se quiere usar el nombre "Up Equipos" como negocio en Meta).
- Número de prueba usado: `+1 (555) 624-1980`, WABA ID `880562888436811`.

### Gotchas aprendidos (para no repetir la depuración el domingo)
1. **Verificar el webhook (GET) no es suficiente.** Hay que además **suscribirse al campo
   `messages`** en la lista de "Webhook fields" (a veces ya viene suscrito, a veces no).
2. **El botón "Probar" en la lista de campos NO prueba el flujo real** — solo llama
   directamente a nuestro endpoint con un payload de ejemplo. Que "Probar" funcione no
   garantiza que los mensajes reales lleguen.
3. **Paso que casi siempre falta y es el que de verdad conecta todo:** suscribir el WABA a la
   app explícitamente con la API:
   ```
   POST https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps
   Authorization: Bearer {token}
   ```
   Se hace fácil desde **Graph API Explorer** (developers.facebook.com/tools/explorer):
   elegir la app, pegar el token, método POST, ruta `{WABA_ID}/subscribed_apps`, Enviar.
   Responde `{"success": true}`. Sin este paso, el webhook está bien configurado pero **Meta
   nunca reenvía los mensajes reales** (aunque la verificación GET sí funcione).
4. **El número de prueba solo envía/recibe con números autorizados.** Se agregan en
   "Configuración de la API" → sección "Destinatario"/"Para" → verificación por código.
   Error típico si falta este paso al enviar: `(#131030) Recipient phone number not in
   allowed list`.
5. **El token de prueba dura 24h.** Si deja de responder de un día para otro, regenerar el
   token en "Configuración de la API" → "Generar token", y actualizar el secret
   `WHATSAPP_TOKEN` en Supabase.
6. Para depurar: `mcp__Supabase__get_logs` (service `edge-function`) muestra las líneas de
   petición (`GET/POST | status | url`), pero **no** el `console.error` interno — para ver el
   error real conviene mirar directo la tabla `whatsapp_sesiones_web` (¿se guardó el
   `historial` con la respuesta de Claude?) o probar el envío de WhatsApp de forma aislada
   con Graph API Explorer.

### Panel de auditoría/intervención (`whatsapp.html`)
- Página interna tipo "WhatsApp Web" para que el comercial audite lo que habla Liam por
  WhatsApp y pueda intervenir en vivo. `noindex`, no enlazada, protegida por **clave**
  (misma tabla `web_panel_config` que `panel.html`, vía RPC `web_panel_check_clave`).
- **Edge Function `whatsapp-panel`** (verify_jwt=false): backend del panel, mismo patrón de
  rate-limit por IP que `panel-web` (tabla `panel_web_login_attempts`). Acciones (`action` en el body):
  - `list`: devuelve todas las sesiones de `whatsapp_sesiones_web` (teléfono, nombre, historial,
    `lead_captured`, `bot_activo`, `cliente_web_id`, `updated_at`).
  - `toggle_bot` (`telefono`, `activo`): interruptor manual para pausar/reanudar a Liam en esa
    conversación puntual.
  - `send` (`telefono`, `mensaje`): envía el mensaje por la Graph API de WhatsApp como si fuera
    el comercial, lo guarda en el `historial` con `origen:"humano"`, y **pausa el bot
    automáticamente** (`bot_activo=false`) para que Liam no siga respondiendo esa conversación.
- **Columna `bot_activo`** (bool, default `true`) en `whatsapp_sesiones_web`: `up-whatsapp`
  la revisa en cada mensaje entrante — si está en `false`, solo guarda el mensaje del cliente
  en el historial (para que se vea en el panel) y **no** llama a Claude ni responde por
  WhatsApp, hasta que el comercial reactive el interruptor desde `whatsapp.html`.
- **Columna `nombre`** (text) en `whatsapp_sesiones_web`: se completa con el `profile.name`
  que manda Meta en el primer mensaje, para mostrar nombre en vez de solo el teléfono.
- Cada entrada del `historial` ahora trae `origen` (`"cliente"` / `"bot"` / `"humano"`) y `ts`,
  usado solo para pintar el chat en el panel — al armar el payload para Anthropic (`up-whatsapp`)
  se sigue enviando solo `{role, content}` (se filtran los campos extra).
- Interfaz (estética tipo WhatsApp Web): lista de conversaciones a la izquierda con **avatar de
  iniciales** (color por teléfono), preview, punto de estado (verde=bot activo / naranja=pausado)
  y pill "Lead"; chat a la derecha con **burbujas con cola** (cliente gris a la izquierda; Liam
  verde y el humano azul a la derecha, con etiqueta distinta), **separadores de día**
  (Hoy/Ayer/fecha) y hora dentro de la burbuja; interruptor de bot arriba del chat y caja de
  texto abajo para responder como asesor. Fondo con patrón sutil.
  - ⚠️ **Bug de render corregido:** el `white-space:pre-wrap` estaba en toda la `.bubble` y
    renderizaba los saltos de línea del template literal → burbujas gigantes y vacías. Se movió
    a un `<span class="txt">` que envuelve solo el texto del mensaje.
- **Refresco "en vivo" por polling adaptativo (NO Supabase Realtime, por seguridad):** se
  descartó Realtime a propósito — expondría `whatsapp_sesiones_web` vía la anon key pública
  (rompería la privacidad que hoy garantiza la Edge Function con clave). En su lugar:
  `startPolling` usa `setTimeout` recursivo con `pollDelay()` → **3s** en el chat abierto, **6s**
  navegando la lista, **8s** en segundo plano (pestaña oculta, para poder avisar igual).
  - **Aviso de mensaje nuevo:** `detectarNuevos()` compara el ts del último mensaje ENTRANTE
    (`role:'user'`) de cada sesión (`ultimoInboundTs`, robusto ante el recorte de historial);
    si aparece uno nuevo y no es el chat que estás mirando/enfocado, suena un **beep**
    (WebAudio, sin assets) y **parpadea el título** de la pestaña ("💬 (N) mensajes nuevos").
    Se limpia al enfocar la ventana/pestaña o abrir una conversación. `baselineHecho` evita
    avisar por todo lo que ya existía al abrir el panel.

### Pendiente para el domingo (pasar a número definitivo)
- [ ] Generar **token permanente** (System User, sin expiración) — el de prueba expira en 24h.
- [ ] Conseguir/activar el **número de WhatsApp definitivo** (no el de prueba `+1 555...`).
- [ ] Repetir el paso de `subscribed_apps` con el WABA del número definitivo.
- [ ] Verificar el negocio en Meta (Business Verification) — requisito para número real sin
      límite de destinatarios.
- [ ] Decidir si se usa el portfolio **Up Equipos** (hoy bloqueado, hay que apelar) o
      **Vehimaquinas** (ya aprobado, usado en las pruebas).
- [ ] Probar el flujo de **cotización** end-to-end por WhatsApp (hoy solo se probó saludo/charla).
- [ ] Actualizar `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_TOKEN` en los secrets con los datos
      del número definitivo.

### Estilo comercial de Liam (ajustado, ver `SYSTEM_PROMPT` en `up-whatsapp`)
Tono pedido por el cliente: **amable, profesional y seguro**, estilo comercial colombiano
estándar (no informal de más). Reglas clave agregadas: usa frases naturales ("con gusto",
"te cuento que...") sin abusar; si el cliente escribe algo corto/vago dos veces seguidas,
Liam retoma la iniciativa en vez de seguir bromeando; cierra casi siempre con una pregunta
que avanza la venta (altura, ciudad, cuándo lo necesita).

## Open Graph / miniatura WhatsApp
- Las metaetiquetas OG/Twitter en `index.html` deben apuntar al **dominio donde está alojado
  el sitio** (`pagina-up.onrender.com`), si no WhatsApp no carga la miniatura. Imagen:
  `imagenes/og-image.png` (1200x630). WhatsApp/Facebook cachean: usar el debugger de Facebook
  ("Scrape Again") o un `?v=N` para forzar refresco.

## Config frontend (`js/config.js`)
`window.UP_CONFIG`: `supabaseUrl`, `anonKey`, `edgeFunctionUrl` (up-asesor),
`cotizarUrl` (up-cotizar), `clienteUrl` (up-cliente, ya no se usa: se reemplazó por la RPC),
`whatsappComercial` (número del comercial para los botones de WhatsApp, formato 57XXXXXXXXXX).

## Panel de leads (`panel.html`)
- Panel interno para el comercial: lista `clientes_web` y `cotizaciones_web` con KPIs,
  links a WhatsApp y al PDF, y cambio de estado de cotizaciones. `noindex`, no enlazado.
- Protegido por **clave** (no expone datos sensibles): RPCs SECURITY DEFINER
  **`panel_web(p_clave)`** (devuelve clientes+cotizaciones) y
  **`panel_web_set_estado(p_clave,p_id,p_estado)`**. La clave vive en la tabla
  **`web_panel_config`** (editable desde Studio). Clave por defecto: `UP-leads-2026`.
- ⚠️ **Bug corregido:** estas RPCs (y `web_panel_check_clave`, usada por `whatsapp.html`)
  tenían `SET search_path TO 'public'`, lo que dejaba fuera el esquema `extensions` donde vive
  `pgcrypto` — `crypt()` no resolvía y el login del panel fallaba siempre. Se corrigió a
  `SET search_path TO public, extensions` (sin comillas: sino Postgres lo toma como un solo
  nombre literal "public, extensions" en vez de dos esquemas). Si se crea una RPC nueva que
  compare `clave_hash` con `crypt()`, usar ese mismo `search_path`.

## Chat: dos modos (selector al iniciar)
- **Directo** (cliente con experiencia): NO usa IA (0 tokens). Responde con el motor local
  por palabras clave (`responses`/`detectIntent` en `assistant.js`) + el cotizador determinista.
- **Asistido** (cliente primerizo): usa Claude (`up-asesor`). Liam guía y recomienda equipo.
  Las reglas/catálogo se **inyectan desde el frontend** (`ASSISTED_GUIDE` en `assistant.js`)
  en el primer turno, para funcionar aunque `up-asesor` no esté redesplegado.
  Ej. de regla: una unipersonal NO sirve en exteriores.

## Cotizador: detección inteligente y multiequipo
- El cotizador (`js/cotizador.js`, `UPCotizador`) recibe el **contexto del chat** (`start(restart, contextText)`)
  y NO vuelve a preguntar lo que el cliente ya dijo:
  - **Cliente**: si en el chat dio un **NIT/teléfono** (7-12 dígitos) o "ya soy cliente", lo busca con la
    RPC **`buscar_cliente_web(p_telefono,p_nit)`** y salta el "¿ya eres cliente?" y el formulario.
    Si no lo encuentra, abre el formulario **prellenando** el NIT/teléfono.
  - **Equipo**: detecta modelo ("3246","Z45") o tipo+altura ("tijera de 12 m" → GENIE 3246) y confirma
    "¿la uso?" en vez de mostrar toda la lista (`matchTarifa`).
  - **Cantidad y días**: los extrae del chat ("2 tijeras", "por 4 días") y no los repregunta.
- **Multiequipo**: una cotización puede tener varios equipos. Flujo: equipo → cantidad → días →
  "➕ otro equipo / ✅ generar". Se genera con la RPC **`cotizar_web(p_cliente_web_id, p_items jsonb, p_ciudad, p_mensaje)`**
  (calcula cada línea por tramo + IVA, guarda el detalle en `cotizaciones_web.items_json`).
  - El PDF (`print_cotizacion.html`) muestra **tabla** de equipos cuando hay `items_json`.
  - `cotizar_web` reemplazó en la práctica a la Edge Function `up-cotizar` para generar (evita el deploy bloqueado).
- El chat **renderiza markdown** de Claude (negritas, viñetas) en `assistant.js` (`formatMarkdown`).
- **Capacidad de carga**: 227 kg todos los equipos, 159 kg las unipersonales (regla en `ASSISTED_GUIDE` +
  recordatorio `CAP_NOTE` por turno, porque el `up-asesor` desplegado traía 454 kg).
- Liam (asistido) **no interroga si la solicitud ya es clara**; solo pregunta cuando falta info.

## Modo presentación (`js/presentacion.js`) — la página se presenta sola
- Globos flotantes (tour guiado) + tooltips al pasar el mouse. Enfocado en Liam, el botón "Cotizar ahora"
  (concepto: en horario laboral → asesor humano; fuera de horario → Liam IA), WhatsApp, **panel comercial**
  (con botón "Abrir el panel"), **sedes/mapas** y la visión a futuro. Es **solo presentación/demo**, no cambia funciones.
- **DESACTIVADO por defecto**: la página normal queda limpia (solo consulta/cotización).
  Se activa **únicamente** abriendo el sitio con **`?demo=1`** (ej. `pagina-up.onrender.com/?demo=1`).
  Con `?demo=1` aparece el botón "👋 ¿Cómo funciona?", auto-arranca el tour, y la tecla `?` lo reabre.

### CÓMO QUITAR EL MODO PRESENTACIÓN (para el futuro)
- **Quitarlo por completo**: borrar UNA línea en `index.html`:
  `<script src="js/presentacion.js"></script>` (queda justo después de `js/main.js`).
  Con eso desaparece todo (botón, globos, tooltips), incluso con `?demo=1`. El archivo `js/presentacion.js`
  queda en el repo por si se quiere reactivar (volver a poner la línea).
- **Solo ocultarlo a clientes** (estado actual): ya está oculto por defecto; solo se ve con `?demo=1`.
- No afecta nada del chat, cotizador ni panel (es 100% independiente).

## Pendientes / notas
- Ajustar `whatsappComercial` si cambia el número comercial.
- Editar tarifas → tabla `tarifas_web` en Studio (no requiere código).
- Hay una cotización de prueba real: **COT-W0001** (cliente "ORLANDO ABAD MONTES").
  Borrarla si se quiere dejar limpio.
- Las funciones `up-cliente`/`up-cotizar` del repo pueden estar más nuevas que las desplegadas
  si el deploy quedó bloqueado; el NIT ya funciona vía RPC + trigger sin necesidad de redeploy.
