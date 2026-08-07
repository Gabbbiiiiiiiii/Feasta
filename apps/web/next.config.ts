import type {NextConfig} from "next";

const production =
  process.env.NODE_ENV === "production";

const firebaseProjectId =
  process.env
    .NEXT_PUBLIC_FIREBASE_PROJECT_ID
    ?.trim();

const firebaseAuthDomain =
  process.env
    .NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    ?.trim();

const firebaseAuthOrigin =
  firebaseAuthDomain
    ? `https://${firebaseAuthDomain}`
    : null;

const firebaseFunctionsOrigin =
  firebaseProjectId
    ? `https://asia-southeast1-${firebaseProjectId}.cloudfunctions.net`
    : null;

const scriptSrc = [
  "'self'",

  // Next.js emits inline bootstrap scripts. Development additionally
  // requires unsafe-eval for source maps and Fast Refresh.
  "'unsafe-inline'",

  ...(
    production
      ? []
      : ["'unsafe-eval'"]
  ),

  "https://www.google.com",
  "https://www.gstatic.com",
  "https://apis.google.com",
  "https://accounts.google.com",
];

const connectSrc = [
  "'self'",
  "https://api.cloudinary.com",
  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "https://*.google.com",
  "https://www.gstatic.com",
  "https://www.recaptcha.net",
  "wss://*.firebaseio.com",

  ...(firebaseAuthOrigin
    ? [firebaseAuthOrigin]
    : []),

  ...(firebaseFunctionsOrigin
    ? [firebaseFunctionsOrigin]
    : []),

  ...(
    production
      ? []
      : [
          "http://127.0.0.1:*",
          "http://localhost:*",
          "ws://127.0.0.1:*",
          "ws://localhost:*",
        ]
  ),
];

const frameSrc = [
  "'self'",
  "https://accounts.google.com",
  "https://www.google.com",
  "https://recaptcha.google.com",
  "https://www.recaptcha.net",

  ...(firebaseAuthOrigin
    ? [firebaseAuthOrigin]
    : []),
];

const contentSecurityPolicy = [
  "default-src 'self'",

  `script-src ${scriptSrc.join(" ")}`,

  "style-src 'self' 'unsafe-inline'",

  [
    "img-src",
    "'self'",
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://*.googleusercontent.com",
    "https://*.googleapis.com",
    "https://firebasestorage.googleapis.com",
  ].join(" "),

  "font-src 'self' data:",

  `connect-src ${connectSrc.join(" ")}`,

  `frame-src ${frameSrc.join(" ")}`,

  [
    "worker-src",
    "'self'",
    "blob:",
    "https://www.google.com",
    "https://www.gstatic.com",
  ].join(" "),

  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",

  ...(
    production
      ? ["upgrade-insecure-requests"]
      : []
  ),
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname:
          "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },

  async headers() {
    const headers = [
      {
        key:
          "Content-Security-Policy",
        value:
          contentSecurityPolicy,
      },
      {
        key:
          "X-Content-Type-Options",
        value:
          "nosniff",
      },
      {
        key:
          "Referrer-Policy",
        value:
          "strict-origin-when-cross-origin",
      },
      {
        key:
          "Permissions-Policy",
        value:
          "camera=(), microphone=(), " +
          "geolocation=(self), payment=()",
      },
      {
        key:
          "X-Frame-Options",
        value:
          "DENY",
      },
      {
        key:
          "Cross-Origin-Opener-Policy",
        value:
          "same-origin-allow-popups",
      },
      {
        key:
          "Cross-Origin-Resource-Policy",
        value:
          "same-origin",
      },
    ];

    if (production) {
      headers.push({
        key:
          "Strict-Transport-Security",
        value:
          "max-age=31536000; " +
          "includeSubDomains",
      });
    }

    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },
};

export default nextConfig;