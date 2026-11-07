/**
 * ══════════════════════════════════════════════════════════════════════════════
 * CineVerse: Cloudflare Pages API Edge Security Middleware (/api/_middleware.js)
 * ══════════════════════════════════════════════════════════════════════════════
 * Protege EXCLUSIVAMENTE los endpoints bajo /api/* (TMDB proxy, etc.)
 * Los archivos estáticos (.html, .css, .js, imágenes) NO son interceptados.
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
  /\$\{jndi:/i               // Log4Shell RCE
];

// ── Rate Limiter en Memoria para APIs (Ventana deslizante de 1 minuto) ──────
const ipLimitStore = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_API_REQUESTS = 180;     // 180 llamadas por minuto (amplio para carruseles y navegación rápida)

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

  // Limpieza periódica de memoria
  if (ipLimitStore.size > 3000) {
    for (const [key, val] of ipLimitStore.entries()) {
      if (now > val.resetTime) ipLimitStore.delete(key);
    }
  }

  if (entry.count > MAX_API_REQUESTS) {
    const retrySec = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));
    return { limited: true, retrySec };
  }

  return { limited: false, remaining: MAX_API_REQUESTS - entry.count };
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // Solo actuar en rutas de API
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  // Permitir preflight OPTIONS libremente para CORS
  if (request.method === 'OPTIONS') {
    return next();
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For') || 
                   'unknown-ip';
  const userAgent = (request.headers.get('User-Agent') || '').trim();

  // 1. FILTRO ANTI-BOT Y SCRAPERS MALICIOSOS (Solo en endpoints que no sean webhooks)
  const isWebhook = url.pathname.includes('/kofi-webhook') || url.pathname.includes('/stripe-webhook');
  if (!isWebhook && userAgent) {
    const uaLower = userAgent.toLowerCase();
    const isBot = BLOCKED_BOT_KEYWORDS.some(kw => uaLower.includes(kw));
    if (isBot) {
      console.warn(`[Shield Block] Bot detectado: IP=${clientIp}, UA=${userAgent}`);
      return new Response(JSON.stringify({ 
        error: 'Forbidden: Agente de escaneo o bot denegado.',
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
      error: 'Bad Request: Patrón no permitido.',
      code: 'EXPLOIT_BLOCKED'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' }
    });
  }

  // 3. RATE LIMITING EN EL EDGE PARA APIS (180 req/min)
  if (!isWebhook) {
    const rateCheck = isRateLimited(clientIp);
    if (rateCheck.limited) {
      console.warn(`[Shield Rate Limit] IP excedida: ${clientIp}`);
      return new Response(JSON.stringify({ 
        error: 'Demasiadas solicitudes a la API. Espera unos momentos.',
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

  // Ejecutar endpoint de API
  const response = await next();

  // 4. CABECERAS DE SEGURIDAD EN RESPUESTAS DE API
  const secureHeaders = new Headers(response.headers);
  secureHeaders.set('X-Content-Type-Options', 'nosniff');
  secureHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: secureHeaders
  });
}
