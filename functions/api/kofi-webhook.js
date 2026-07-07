/**
 * ═══ CineVerse: Ko-fi Webhook — Cloudflare Pages Function ═══
 * 
 * Ruta: functions/api/kofi-webhook.js
 * URL:  https://cineverse.pages.dev/api/kofi-webhook
 * 
 * CONFIGURACIÓN EN KO-FI:
 * 1. Ve a ko-fi.com → Configuración → API → Webhooks
 * 2. Añade la URL: https://TU-DOMINIO.pages.dev/api/kofi-webhook
 * 3. Copia el "Verification Token" y añádelo como variable de entorno en Cloudflare:
 *    Nombre: KOFI_VERIFICATION_TOKEN
 * 
 * VARIABLES DE ENTORNO requeridas en Cloudflare Pages:
 *   - KOFI_VERIFICATION_TOKEN  → Token secreto de Ko-fi
 *   - SUPABASE_URL             → URL de tu proyecto Supabase
 *   - SUPABASE_SERVICE_KEY     → Service Role Key de Supabase (con acceso a INSERT en premium_codes)
 */

export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    const rawData  = formData.get('data');

    if (!rawData) {
      return new Response('No data received', { status: 400 });
    }

    let payload;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return new Response('Invalid JSON payload', { status: 400 });
    }

    // ── 1. Verificar el token de seguridad de Ko-fi ──────────────────────────
    // Credenciales — configuradas como variables de entorno en Cloudflare Pages
    const KOFI_TOKEN    = env.KOFI_VERIFICATION_TOKEN || 'b4e2bb97-3dc4-42fe-9948-354a454b9954';
    const SUPABASE_URL  = env.SUPABASE_URL             || 'https://oeibxtnltxxcaiwvpldi.supabase.co';
    const SUPABASE_KEY  = env.SUPABASE_SERVICE_KEY     || '';

    if (payload.verification_token !== KOFI_TOKEN) {
      return new Response('Unauthorized', { status: 401 });
    }

    // ── 2. Filtrar solo pagos únicos (ignorar suscripciones mensuales o donaciones sin monto definido) ──
    const isShopOrder   = payload.type === 'Shop Order';
    const isDonation    = payload.type === 'Donation';
    const isSubscription = payload.type === 'Subscription';

    if (!isShopOrder && !isDonation && !isSubscription) {
      return new Response('OK (event ignored)', { status: 200 });
    }

    // ── 3. Determinar duración del Premium según el monto pagado ──────────────
    const amount   = parseFloat(payload.amount || '0');
    const email    = (payload.email || '').toLowerCase().trim();
    const message  = (payload.message || '').trim();

    if (!email) {
      console.warn('[Ko-fi Webhook] Pago sin email. Payload:', JSON.stringify(payload));
      return new Response('OK (no email)', { status: 200 });
    }

    let durationDays;
    if (amount >= 15) {
      durationDays = 36500;   // Vitalicio (100 años)
    } else if (amount >= 10) {
      durationDays = 90;      // 90 días
    } else if (amount >= 5) {
      durationDays = 30;      // 30 días
    } else {
      // Monto muy pequeño — ignorar o registrar como donación sin código
      return new Response('OK (amount too low)', { status: 200 });
    }

    // ── 4. Generar código Premium único tipo CINE-XXXX-XXXX-XXXX ─────────────
    function generateCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const segment = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      return `CINE-${segment(4)}-${segment(4)}-${segment(4)}`;
    }

    let code = generateCode();
    
    // Calcular fecha de expiración
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    const isLifetime = durationDays === 36500;

    // ── 5. Insertar código en Supabase ────────────────────────────────────────
    if (!SUPABASE_KEY) {
      console.error('[Ko-fi Webhook] Falta SUPABASE_SERVICE_KEY en las variables de entorno');
      return new Response('Server config error: missing service key', { status: 500 });
    }

    const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/premium_codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        code:                 code,
        duration_days:        durationDays,
        expires_at:           expiresAt.toISOString(),
        is_lifetime:          isLifetime,
        is_used:              false,
        purchased_by_email:   email,
        notes:                `Ko-fi auto | $${amount} | ${message || 'Sin mensaje'}`,
        created_at:           new Date().toISOString()
      })
    });

    if (!insertResponse.ok) {
      const errText = await insertResponse.text();
      console.error('[Ko-fi Webhook] Error al insertar en Supabase:', errText);
      return new Response('DB error', { status: 500 });
    }

    const [insertedCode] = await insertResponse.json();

    // ── 6. Responder con éxito ─────────────────────────────────────────────────
    console.log(`[Ko-fi Webhook] Código generado: ${code} para ${email} (${durationDays} días)`);
    return new Response(JSON.stringify({ 
      success: true, 
      code: insertedCode.code,
      email, 
      durationDays 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[Ko-fi Webhook] Error inesperado:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
