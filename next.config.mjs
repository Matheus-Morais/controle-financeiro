/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O service worker (public/sw.js) e o manifest são servidos estaticamente.
  // Cabeçalhos para permitir o registro do SW e boas práticas de PWA.
  async headers() {
    return [
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
