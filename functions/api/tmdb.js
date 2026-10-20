// ═══════════════════════════════════════════════════════════════
// CineVerse: Cloudflare Pages Function Proxy para TMDB API
// Ubicación: /functions/api/tmdb.js
// ═══════════════════════════════════════════════════════════════

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Obtener el endpoint de TMDB solicitado (ej: /movie/popular)
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) {
    return new Response(
      JSON.stringify({ error: 'Falta el parámetro "endpoint" en la solicitud.' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://cineverse-7u5.pages.dev'
        }
      }
    );
  }


  // 1b. Validar que el endpoint sea un path TMDB legítimo (solo letras, números, /, -)
  if (!/^\/[a-zA-Z0-9/_\-?=&]+$/.test(endpoint)) {
    return new Response(
      JSON.stringify({ error: 'Endpoint no válido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 1c. Verificar Origin de la solicitud
  const origin = request.headers.get('Origin') || '';
  const referer = request.headers.get('Referer') || '';
  const allowedOrigins = ['https://cineverse-7u5.pages.dev'];
  const isAllowedOrigin = allowedOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));
  const isCapacitorApp = request.headers.get('User-Agent')?.includes('Capacitor');
  if (!isAllowedOrigin && !isCapacitorApp) {
    return new Response(JSON.stringify({ error: 'Acceso no autorizado.' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    });
  }
  // 2. Clonar y preparar los parámetros de búsqueda
  const params = new URLSearchParams(url.search);
  params.delete('endpoint'); // Eliminar de los parámetros que se envían a TMDB

  // 3. Obtener la API Key desde las Variables de Entorno de Cloudflare
  // Si no está definida en el panel, se usa la clave actual como fallback automático
  // API Key OBLIGATORIA desde variables de entorno de Cloudflare Pages
  // Configura TMDB_API_KEY en: Cloudflare Pages → Settings → Environment Variables
  const apiKey = env.TMDB_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Servicio no disponible temporalmente.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://cineverse-7u5.pages.dev' } }
    );
  }
  params.set('api_key', apiKey);

  // 4. Construir la URL final hacia la API oficial de TMDB
  const tmdbUrl = `https://api.themoviedb.org/3${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(tmdbUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `TMDB retornó código de estado ${response.status}` }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'https://cineverse-7u5.pages.dev'
          }
        }
      );
    }

    const text = await response.text();
    if (text.length > 512000) { // 500KB máx
      return new Response(JSON.stringify({ error: 'Respuesta demasiado grande.' }), {
        status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://cineverse-7u5.pages.dev' }
      });
    }
    const data = JSON.parse(text);

    // 5. Retornar la respuesta con CORS habilitado
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://cineverse-7u5.pages.dev',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=3600' // Almacenar en caché en el navegador por 1 hora
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Error interno de red: ${error.message}` }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://cineverse-7u5.pages.dev'
        }
      }
    );
  }
}
