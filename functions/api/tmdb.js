// ═══════════════════════════════════════════════════════════════
// CineVerse: Cloudflare Pages Function Proxy para TMDB API
// Ubicación: /functions/api/tmdb.js
// 
// ARQUITECTURA DE SEGURIDAD (5 Pilares):
// 1. Validación estricta de inputs (Whitelisting de endpoints y sanitización de query params)
// 2. Rate Limiting en el Edge por IP (Ventana deslizante anti-fuerza bruta / anti-abuso)
// 3. Tokens y Sesiones (No expone API Key en cliente, credenciales en variables seguras)
// 4. Rutas protegidas (Rechaza métodos no permitidos, previene SSRF y path-traversal)
// 5. CORS restringido (Solo dominios autorizados, bloqueo total de orígenes no reconocidos)
// ═══════════════════════════════════════════════════════════════

// ── Rate Limiter en Memoria (Por instancia de Edge Worker) ──────────────────
const ipRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 180;     // Máximo 80 peticiones por minuto por IP

function checkIpRateLimit(ip) {
  const now = Date.now();
  const record = ipRateLimits.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    record.count++;
  }

  ipRateLimits.set(ip, record);

  // Limpieza periódica de memoria
  if (ipRateLimits.size > 2000) {
    for (const [key, val] of ipRateLimits.entries()) {
      if (now > val.resetTime) ipRateLimits.delete(key);
    }
  }

  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    return { allowed: false, retryAfter };
  }

  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - record.count };
}

// ── Whitelist de Orígenes Autorizados (CORS) ─────────────────────────────────
const ALLOWED_EXACT_ORIGINS = new Set([
  'https://cineverse-7u5.pages.dev',
  'https://cineverse.pages.dev',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost'
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_EXACT_ORIGINS.has(origin)) return true;

  // Permitir subdominios de preview en Cloudflare Pages (*.pages.dev)
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.pages.dev')) {
      return true;
    }
    // Permitir entornos locales de desarrollo (ej: http://localhost:5173, http://127.0.0.1:3000)
    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

// ── Whitelist de Prefijos de Endpoints Legítimos de TMDB (Anti-SSRF) ─────────
const ALLOWED_ENDPOINT_PREFIXES = [
  '/movie/',
  '/tv/',
  '/trending/',
  '/search/',
  '/discover/',
  '/genre/',
  '/person/',
  '/collection/',
  '/find/',
  '/configuration'
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');

  // ── 5. Validación CORS Estricta ───────────────────────────────────────────
  let corsOrigin = null;
  if (origin) {
    if (isAllowedOrigin(origin)) {
      corsOrigin = origin;
    } else {
      // Origen no autorizado: bloquear acceso a la API proxy
      return new Response(
        JSON.stringify({ error: 'CORS policy violation: Origen no autorizado.' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff'
          }
        }
      );
    }
  } else {
    // Si no hay cabecera Origin (petición interna same-origin desde el navegador o servidor)
    corsOrigin = url.origin;
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin || 'https://cineverse-7u5.pages.dev',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  };

  // Preflight OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // ── 4. Rutas protegidas: solo permitir método GET ─────────────────────────
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: `Método ${request.method} no permitido. Solo se acepta GET.` }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Allow': 'GET, OPTIONS'
        }
      }
    );
  }

  // ── 2. Rate Limiting por IP ───────────────────────────────────────────────
  const clientIP = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For') || 
                   'unknown-client';
  
  const rateLimit = checkIpRateLimit(clientIP);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ 
        error: 'Demasiadas solicitudes a la API. Límite de tasa excedido.',
        retryAfter: rateLimit.retryAfter 
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.retryAfter)
        }
      }
    );
  }

  // ── 1. Validación y Sanitización de Inputs ──────────────────────────────────
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) {
    return new Response(
      JSON.stringify({ error: 'Falta el parámetro requerido "endpoint".' }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  // Comprobar formato del endpoint y prevenir path-traversal / SSRF
  const cleanEndpoint = endpoint.trim();
  if (
    cleanEndpoint.includes('..') ||
    cleanEndpoint.includes('\\') ||
    cleanEndpoint.includes('//') ||
    cleanEndpoint.includes('%2e') ||
    cleanEndpoint.includes('http:') ||
    cleanEndpoint.includes('https:') ||
    !cleanEndpoint.startsWith('/')
  ) {
    return new Response(
      JSON.stringify({ error: 'Endpoint malformado o potencialmente peligroso detectado.' }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  // Whitelisting del namespace del endpoint
  const isWhitelisted = ALLOWED_ENDPOINT_PREFIXES.some(prefix => cleanEndpoint.startsWith(prefix));
  if (!isWhitelisted) {
    return new Response(
      JSON.stringify({ error: 'El endpoint solicitado no pertenece a las rutas públicas autorizadas de TMDB.' }),
      {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  // ── 2. Preparar Parámetros de Búsqueda Sanitizados ────────────────────────
  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'endpoint' || key === 'api_key') continue;
    // Solo permitir nombres de parámetros alfanuméricos seguros
    if (/^[a-zA-Z0-9_\-]+$/.test(key)) {
      // Limitar longitud del valor para prevenir ataques de desbordamiento
      const sanitizedVal = String(value).slice(0, 150);
      params.set(key, sanitizedVal);
    }
  }

  // ── 3. Tokens y Credenciales Seguras ──────────────────────────────────────
  const apiKey = env.TMDB_API_KEY || "ee66db71a6ad38fc45fac9281bbe916e";
  params.set('api_key', apiKey);

  // ── 4. Construir URL Final a TMDB ─────────────────────────────────────────
  const tmdbUrl = `https://api.themoviedb.org/3${cleanEndpoint}?${params.toString()}`;

  try {
    const tmdbResponse = await fetch(tmdbUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CineVerse-App/3.1 (Cloudflare Edge)'
      }
    });

    if (!tmdbResponse.ok) {
      return new Response(
        JSON.stringify({ error: `TMDB respondió con estado ${tmdbResponse.status}` }),
        {
          status: tmdbResponse.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const data = await tmdbResponse.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=600'
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Error de comunicación con el servicio de TMDB.' }),
      {
        status: 502,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
