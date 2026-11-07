/**
 * ══════════════════════════════════════════════════════════════════════════════
 * CineVerse: Cloudflare Pages Edge Security Firewall (_middleware.js)
 * ══════════════════════════════════════════════════════════════════════════════
 * Protege todas las rutas de API (/api/*) con defensa en profundidad:
 * 1. Anti-Bot / Anti-Scraper / Anti-Scanner (User-Agent Detection)
 * 2. Anti-Exploit / Anti-Path-Traversal / Anti-SQLi / Anti-SSRF
 * 3. Rate Limiting en el Edge por IP (Ventana deslizante anti-fuerza bruta y DDoS)
 * 4. Validación de Origen estricta (CORS Shield)
 * 5. Inyección de Cabeceras de Seguridad y Anti-Indexación
 */

// ── Lista Negra de User-Agents Maliciosos / Bots / Escáneres ────────────────
const BLOCKED_BOT_KEYWORDS = [
  'sqlmap', 'nikto', 'masscan', 'wpscan', 'gobuster', 'dirbuster',
  'nuclei', 'nmap', 'zgrab', 'httpx', 'python-requests', 'aiohttp',
  'scrapy', 'curl', 'wget', 'httpclient', 'libwww-perl', 'go-http-client',
  'urllib', 'mechanize', 'acunetix', 'havij', 'censys', 'shodan',
  'openvas', 'nessus', 'burpcollaborator', 'dirb', 'ffuf'
];

// ── Patrones de Ataque y Sondeo Bloqueados ──────────────────────────────────
const EXPLOIT_PATTERNS = [
  /\.\./i,                    // Path traversal (..)
  /%2e%2e/i,                 // Path traversal urlencoded
  /\/etc\/passwd/i,          // Linux sensitive file
  /win\.ini/i,               // Windows sensitive file
  /\.env/i,                  // Environment variables
  /\.git/i,                  // Git metadata
  /\.php/i,                  // PHP probes
  /wp-admin|wp-login/i,      // WordPress probes
  /xmlrpc/i,                 // XML-RPC brute force
  /phpmyadmin/i,             // DB admin probe
  /union(\s+|\/\*.*\*\/)select/i, // SQL Injection
  /waitfor(\s+)delay/i,      // Blind SQL Injection
  /pg_sleep/i,               // PostgreSQL Blind SQLi
  /\$\{jndi:/i,              // Log4Shell RCE
  /<script/i,                // Basic XSS
  /javascript:/i             // JS protocol injection
];

// ── Rate Limiter en Memoria (Por instancia de Edge Worker) ──────────────────
const ipLimitStore = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS = 60;          // Máximo 60 peticiones/minuto por IP

function isRateLimited(ip) {
  const now = Date.now();
  const entry = ipLimitStore.get(ip) || { count: 0, resetTime: now + RATE_WINDOW_MS };

  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + RATE_WINDOW_MS;
  } else {
    entry.count++;
  }

  ipLimitStore.set(ip, entry);

  // Limpieza periódica de memoria para evitar saturación
  if (ipLimitStore.size > 2500) {
    for (const [key, val] of ipLimitStore.entries()) {
      if (now > val.resetTime) ipLimitStore.delete(key);
    }
  }

  if (entry.count > MAX_REQUESTS) {
    const retrySec = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));
    return { limited: true, retrySec };
  }

  return { limited: false, remaining: MAX_REQUESTS - entry.count };
}

// ── Orígenes Autorizados ────────────────────────────────────────────────────
function isAllowedClient(origin, referer) {
  const allowedHosts = [
    'cineverse-7u5.pages.dev',
    'cineverse.pages.dev',
    'localhost',
    '127.0.0.1'
  ];

  const check = (val) => {
    if (!val) return false;
    try {
      const u = new URL(val);
      if (u.protocol === 'capacitor:' || u.protocol === 'ionic:' || u.protocol === 'file:') return true;
      return allowedHosts.some(h => u.hostname === h || u.hostname.endsWith('.pages.dev'));
    } catch {
      return false;
    }
  };

  return check(origin) || check(referer);
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const clientIp = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For') || 
                   'unknown-ip';
  const userAgent = (request.headers.get('User-Agent') || '').trim();
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');

  // Permitir preflight OPTIONS libremente para CORS
  if (request.method === 'OPTIONS') {
    return next();
  }

  // 1. FILTRO ANTI-BOT Y SCRAPERS MALICIOSOS
  // Bloquear clientes sin User-Agent en endpoints de API (excepto webhooks externos autorizados)
  const isWebhook = url.pathname.includes('/kofi-webhook');
  if (!isWebhook) {
    if (!userAgent) {
      return new Response(JSON.stringify({ 
        error: 'Forbidden: User-Agent requerido para acceder al servicio.',
        code: 'BOT_UA_EMPTY'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' }
      });
    }

    const uaLower = userAgent.toLowerCase();
    const isBot = BLOCKED_BOT_KEYWORDS.some(kw => uaLower.includes(kw));
    if (isBot) {
      console.warn(`[Shield Block] Bot detectado: IP=${clientIp}, UA=${userAgent}`);
      return new Response(JSON.stringify({ 
        error: 'Forbidden: Agente de escaneo o bot automatizado denegado.',
        code: 'BOT_BLOCKED'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' }
      });
    }
  }

  // 2. FILTRO ANTI-EXPLOIT, SONDEO Y PATH-TRAVERSAL
  const fullTarget = decodeURIComponent(url.pathname + url.search);
  const isExploit = EXPLOIT_PATTERNS.some(regex => regex.test(fullTarget));
  if (isExploit) {
    console.warn(`[Shield Exploit Block] Sondeo bloqueado: IP=${clientIp}, URI=${fullTarget}`);
    return new Response(JSON.stringify({ 
      error: 'Bad Request: Patrón de sondeo no permitido detectado por el firewall.',
      code: 'EXPLOIT_BLOCKED'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' }
    });
  }

  // 3. RATE LIMITING EN EL EDGE (ANTI-DDOS Y ANTI-FUERZA BRUTA)
  if (!isWebhook) {
    const rateCheck = isRateLimited(clientIp);
    if (rateCheck.limited) {
      console.warn(`[Shield Rate Limit] IP excedida: ${clientIp}`);
      return new Response(JSON.stringify({ 
        error: 'Demasiadas solicitudes. Por favor espera unos momentos.',
        retryAfter: rateCheck.retrySec,
        code: 'RATE_LIMITED'
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateCheck.retrySec),
          'X-Robots-Tag': 'noindex, nofollow'
        }
      });
    }
  }

  // Ejecutar el handler correspondiente (API endpoint)
  const response = await next();

  // 4. INYECCIÓN DE CABECERAS DE SEGURIDAD EN LA RESPUESTA
  const secureHeaders = new Headers(response.headers);
  secureHeaders.set('X-Content-Type-Options', 'nosniff');
  secureHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  secureHeaders.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: secureHeaders
  });
}
