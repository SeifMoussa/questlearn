const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// This is the actual browser-facing surface (apps/api's helmet CSP
// mostly guards a JSON API + Swagger UI, not real pages) so this is
// where the Google Fonts allowance matters: fonts.css @font-face rules
// point directly at fonts.gstatic.com woff2 files, no
// fonts.googleapis.com stylesheet involved, so only font-src needs the
// gstatic allowance -- not style-src or a <link> connect-src.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `font-src 'self' https://fonts.gstatic.com`,
  `connect-src 'self' ${apiUrl}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
