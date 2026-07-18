import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";
const scriptSrc = [
  "'self'",
  // Next.js currently emits inline bootstrap scripts. Production excludes
  // unsafe-eval; development keeps it for source maps and fast refresh.
  "'unsafe-inline'",
  ...(production ? [] : ["'unsafe-eval'"]),
  "https://www.google.com",
  "https://www.gstatic.com",
  "https://apis.google.com",
  "https://accounts.google.com",
];
const connectSrc = [
  "'self'",
  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "https://*.google.com",
  "wss://*.firebaseio.com",
  ...(production ? [] : [
    "http://127.0.0.1:*",
    "http://localhost:*",
    "ws://127.0.0.1:*",
    "ws://localhost:*",
  ]),
];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://*.googleapis.com https://firebasestorage.googleapis.com",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(" ")}`,
  "frame-src https://accounts.google.com https://www.google.com https://recaptcha.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(production ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    const headers = [
      {key: "Content-Security-Policy", value: contentSecurityPolicy},
      {key: "X-Content-Type-Options", value: "nosniff"},
      {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
      {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()"},
      {key: "X-Frame-Options", value: "DENY"},
      {key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups"},
      {key: "Cross-Origin-Resource-Policy", value: "same-origin"},
    ];
    if (production) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [{source: "/(.*)", headers}];
  },
};

export default nextConfig;
