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
  images: {
    domains: [
      "glacier-ml-training.s3.amazonaws.com",
      "s3.us-west-2.amazonaws.com",
    ],
  },
};

module.exports = nextConfig;
