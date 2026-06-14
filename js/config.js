/* UP_CONFIG — credenciales Supabase
 * Nota: la ANON KEY de Supabase es pública por diseño (protección vía RLS en el servidor).
 * Para mayor seguridad, asegúrate de tener Row Level Security habilitado en todas las tablas.
 */
window.UP_CONFIG = {
  supabaseUrl:  'https://oguxdohmutqgacahcwop.supabase.co',
  anonKey:      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ndXhkb2htdXRxZ2FjYWhjd29wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Mjc0NzcsImV4cCI6MjA4ODMwMzQ3N30.RRruTo8B7k4R97Igq7_KV1PV58FqrpIzEu0R_MXIwR8',
  edgeFunctionUrl: 'https://oguxdohmutqgacahcwop.supabase.co/functions/v1/up-asesor',
  cotizarUrl:      'https://oguxdohmutqgacahcwop.supabase.co/functions/v1/up-cotizar',
  clienteUrl:      'https://oguxdohmutqgacahcwop.supabase.co/functions/v1/up-cliente',
  // WhatsApp comercial (formato internacional sin + ni espacios)
  whatsappComercial: '573117135363'
};
