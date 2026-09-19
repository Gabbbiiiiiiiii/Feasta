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

const appUrl =
  process.env
    .NEXT_PUBLIC_APP_URL
    ?.trim()
    .replace(/\/+$/u, "");

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
  "https://res.cloudinary.com",

  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "https://*.google.com",
  "https://www.gstatic.com",
  "https://www.recaptcha.net",

  "wss://*.firebaseio.com",

  ...(
    firebaseAuthOrigin
      ? [firebaseAuthOrigin]
      : []
  ),

  ...(
    firebaseFunctionsOrigin
      ? [firebaseFunctionsOrigin]
      : []
  ),

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

  ...(
    firebaseAuthOrigin
      ? [firebaseAuthOrigin]
      : []
  ),
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
    "https://images.unsplash.com",
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

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(self), payment=()",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },

  /*
   * Needed for Firebase/Google popup authentication.
   */
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },

  /*
   * Do not globally force CORP to same-origin.
   * Third-party integrations can legitimately load
   * cross-origin resources.
   */
  ...(production
    ? [
        {
          key: "Strict-Transport-Security",
          value:
            "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextApiCorsHeaders = [
  {
    key: "Access-Control-Allow-Origin",
    value:
      production && appUrl
        ? appUrl
        : "http://localhost:3000",
  },
  {
    key: "Access-Control-Allow-Methods",
    value:
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  },
  {
    key: "Access-Control-Allow-Headers",
    value:
      "Content-Type, Authorization, X-Requested-With, X-Feasta-CSRF",
  },
  {
    key: "Access-Control-Allow-Credentials",
    value: "true",
  },
  {
    key: "Vary",
    value: "Origin",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname:
          "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname:
          "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname:
          "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },

      {
        source: "/api/:path*",
        headers: nextApiCorsHeaders,
      },
    ];
  },
};

export default nextConfig;