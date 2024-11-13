/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites: async () => {
    const backendPort = process.env.PORT || 8000; // Fallback to 8000 if PORT is not set
    return [
      {
        source: "/api/:path*",
        destination:
          process.env.NODE_ENV === "development"
            ? `http://127.0.0.1:${backendPort}/api/:path*`
            : "/api/",
      }
    ];
  },
};

module.exports = nextConfig;