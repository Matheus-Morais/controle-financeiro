/**
 * Cabeçalhos de segurança aplicados a todas as rotas.
 *
 * `script-src` precisa de 'unsafe-inline' enquanto o Next injeta os scripts de
 * hidratação inline (migrar para nonce exige middleware por request). O restante
 * é fechado: nada de terceiros, sem framing e sem envio de formulário para fora.
 * `connect-src` libera o Supabase (auth + PostgREST + realtime via wss).
 */
// O HMR do Next em desenvolvimento avalia código via `eval`; sem 'unsafe-eval' o
// `pnpm dev` quebraria no browser. Produção fica sem essa brecha.
const scriptSrc =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// Escape hatch para validar a política em produção sem quebrar nada: com
// CSP_REPORT_ONLY=1 as violações aparecem no console mas nada é bloqueado.
const cspHeaderKey =
  process.env.CSP_REPORT_ONLY === "1"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

const securityHeaders = [
  { key: cspHeaderKey, value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O service worker (public/sw.js) e o manifest são servidos estaticamente.
  // Cabeçalhos para permitir o registro do SW e boas práticas de PWA.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
