/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  // Permite abrir la app desde la tablet en la red local durante el desarrollo.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
};
export default nextConfig;
