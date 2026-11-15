import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const rawBackend =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE ||
      "https://vanguard-stocks-dashboard.vercel.app";
    let backendUrl = rawBackend.trim().replace(/\/+$/, "");
    if (backendUrl.endsWith("/api")) {
      backendUrl = backendUrl.slice(0, -4).replace(/\/+$/, "");
    }
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
