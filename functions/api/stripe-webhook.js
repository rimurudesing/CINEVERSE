/**
 * CineVerse: Stripe Webhook (/api/stripe-webhook)
 */
const SUPABASE_URL = 'https://oeibxtnltxxcaiwvpldi.supabase.co';
const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9laWJ4dG5sdHh4Y2Fpd3ZwbGRpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTMzMDA3MSwiZXhwIjoyMDk2OTA2MDcxfQ.TnAxJ8n0pqxiUnAV_aw7yyGca02gqWNx3isUNjlEGuk';

export async function onRequestPost(context) {
  const { request, env } = context;
  const sUrl = env.SUPABASE_URL || SUPABASE_URL;
  const sService = env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE;

  try {
    const event = await request.json();

    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object;
      const userId = session?.client_reference_id || session?.metadata?.userId;
      const days = parseInt(session?.metadata?.days || '30', 10);

      if (userId) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        await fetch(sUrl + '/rest/v1/profiles?id=eq.' + userId, {
          method: 'PATCH',
          headers: {
            'apikey': sService,
            'Authorization': 'Bearer ' + sService,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            is_premium: true,
            premium_until: futureDate.toISOString(),
            premium_tier: 'pro'
          })
        });

        console.log('[Stripe Webhook] Usuario activado hasta ' + futureDate.toISOString());
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[Stripe Webhook Error]', err);
    return new Response(JSON.stringify({ error: 'Webhook processing error.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
