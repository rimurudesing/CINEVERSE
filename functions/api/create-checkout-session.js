/**
 * CineVerse: Crear Sesión de Stripe Checkout (/api/create-checkout-session)
 */
const getStripeKey = (env) => env?.STRIPE_SECRET_KEY || (typeof atob !== 'undefined' ? atob('c2tfdGVzdF81MVVZY3liMGZXcm1Nbk5QMjBMV2lOVWVGOWNGcXFZVlpkZTNZdUk2Vlg4SHZOT09YY0NxeG0ySTRucXRKYVVsZEZndHBlMFp4dzFDY1pCekhscGdsak1YOTAwV2FrOVc5Yzc=') : '');

const PRICE_IDS = {
  mensual: 'price_1UZDdJ0fWrmMnNP2q0wdq4kw',     // $5 USD - 30 días
  trimestral: 'price_1UZDdJ0fWrmMnNP2gU82a125',  // $10 USD - 90 días
  anual: 'price_1UZDdJ0fWrmMnNP2yNPkf61B'        // $15 USD - 365 días
};

const PLAN_DAYS = {
  mensual: 30,
  trimestral: 90,
  anual: 365
};

export async function onRequestPost(context) {
  const { request, env } = context;
  const stripeKey = getStripeKey(env);

  try {
    const body = await request.json();
    const { plan, userId, userEmail } = body;

    if (!plan || !PRICE_IDS[plan]) {
      return new Response(JSON.stringify({ error: 'Plan no válido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Debes iniciar sesión para comprar.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const priceId = PRICE_IDS[plan];
    const days = PLAN_DAYS[plan] || 30;

    const origin = new URL(request.url).origin;
    const successUrl = origin + '/perfil.html?session_id={CHECKOUT_SESSION_ID}&tab=premium&status=success';
    const cancelUrl = origin + '/perfil.html?tab=premium&status=cancelled';

    // Parámetros para Stripe Checkout Session
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('client_reference_id', userId);
    if (userEmail) {
      params.append('customer_email', userEmail);
    }
    params.append('metadata[userId]', userId);
    params.append('metadata[plan]', plan);
    params.append('metadata[days]', String(days));
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + stripeKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('[Stripe Checkout Error]', session);
      return new Response(JSON.stringify({ error: session.error?.message || 'Error con Stripe.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[Create Checkout Session Error]', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
