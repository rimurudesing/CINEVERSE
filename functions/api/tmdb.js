// ═══════════════════════════════════════════════════════════════
// CineVerse: Cloudflare Pages Function Proxy para TMDB API
// Ubicación: /functions/api/tmdb.js
// ═══════════════════════════════════════════════════════════════

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Manejo de preflight CORS (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // 1. Obtener el endpoint de TMDB solicitado (ej: /movie/popular)
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) {
    return new Response(
      JSON.stringify({ error: 'Falta el parámetro "endpoint" en la solicitud.' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  // 1b. Validar que el endpoint sea una ruta TMDB legítima (anti-SSRF / anti-path-traversal)
  if (!/^\/[a-zA-Z0-9/_\-?=&]+$/.test(endpoint) || endpoint.includes('..')) {
    return new Response(
      JSON.stringify({ error: 'Endpoint no válido.' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  // 2. Clonar y preparar los parámetros de búsqueda
  const params = new URLSearchParams(url.search);
  params.delete('endpoint'); // Eliminar de los parámetros que se envían a TMDB

  // 3. Obtener la API Key desde las Variables de Entorno de Cloudflare (o fallback del servidor)
  const apiKey = env.TMDB_API_KEY || "ee66db71a6ad38fc45fac9281bbe916e";
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
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    const data = await response.json();

    // 5. Retornar la respuesta con CORS y caché optimizados
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=600'
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Error interno de red: ${error.message}` }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}
