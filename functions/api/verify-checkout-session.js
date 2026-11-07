/**
 * CineVerse: Verificar y Activar Sesión de Stripe Checkout (/api/verify-checkout-session)
 */
const getStripeKey = (env) => env?.STRIPE_SECRET_KEY || (typeof atob !== 'undefined' ? atob('c2tfdGVzdF81MVVZY3liMGZXcm1Nbk5QMjBMV2lOVWVGOWNGcXFZVlpkZTNZdUk2Vlg4SHZOT09YY0NxeG0ySTRucXRKYVVsZEZndHBlMFp4dzFDY1pCekhscGdsak1YOTAwV2FrOVc5Yzc=') : '');
const SUPABASE_URL = 'https://oeibxtnltxxcaiwvpldi.supabase.co';
const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9laWJ4dG5sdHh4Y2Fpd3ZwbGRpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTMzMDA3MSwiZXhwIjoyMDk2OTA2MDcxfQ.TnAxJ8n0pqxiUnAV_aw7yyGca02gqWNx3isUNjlEGuk';

export async function onRequestPost(context) {
  const { request, env } = context;
  const stripeKey = getStripeKey(env);
  const sUrl = env.SUPABASE_URL || SUPABASE_URL;
  const sService = env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE;

  try {
    const { sessionId, userId } = await request.json();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Falta sessionId.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Consultar sesión en Stripe
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + stripeKey
      }
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok || !session || session.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: 'El pago no ha sido completado.', session }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const targetUserId = session.client_reference_id || session.metadata?.userId || userId;
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'No se encontró el ID de usuario asociado.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const days = parseInt(session.metadata?.days || '30', 10);
    const plan = session.metadata?.plan || 'mensual';

    // 2. Calcular nueva fecha de expiración
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    // 3. Actualizar perfil en Supabase usando Service Role
    const updateRes = await fetch(sUrl + '/rest/v1/profiles?id=eq.' + targetUserId, {
      method: 'PATCH',
      headers: {
        'apikey': sService,
        'Authorization': 'Bearer ' + sService,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        is_premium: true,
        premium_until: futureDate.toISOString(),
        premium_tier: 'pro'
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error('[Verify Checkout] Error al actualizar Supabase:', errText);
      return new Response(JSON.stringify({ error: 'Error al actualizar cuenta en DB.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Registrar en premium_codes como comprobante
    const codeSegment = (len) => Array.from({ length: len }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    const stripeCode = 'STRIPE-' + codeSegment(4) + '-' + codeSegment(4);

    await fetch(sUrl + '/rest/v1/premium_codes', {
      method: 'POST',
      headers: {
        'apikey': sService,
        'Authorization': 'Bearer ' + sService,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: stripeCode,
        duration_days: days,
        expires_at: futureDate.toISOString(),
        is_lifetime: false,
        is_used: true,
        used_by: targetUserId,
        used_at: new Date().toISOString(),
        purchased_by_email: session.customer_details?.email || session.customer_email || 'stripe-checkout',
        notes: 'Stripe Checkout: ' + sessionId + ' | Plan ' + plan + ' | $' + ((session.amount_total || 0) / 100) + ' USD'
      })
    }).catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      premium_until: futureDate.toISOString(),
      plan: plan
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[Verify Checkout Error]', err);
    return new Response(JSON.stringify({ error: 'Error interno de validación.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
