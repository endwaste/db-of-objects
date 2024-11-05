/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites: async () => {
    const destinationUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${destinationUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
