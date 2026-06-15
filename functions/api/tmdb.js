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
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  // 2. Clonar y preparar los parámetros de búsqueda
  const params = new URLSearchParams(url.search);
  params.delete('endpoint'); // Eliminar de los parámetros que se envían a TMDB

  // 3. Obtener la API Key desde las Variables de Entorno de Cloudflare
  // Si no está definida en el panel, se usa la clave actual como fallback automático
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

    // 5. Retornar la respuesta con CORS habilitado
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
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
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}
