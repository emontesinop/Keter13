/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: { bodySizeLimit: "200mb" },
  },
  // Permite abrir la app desde la tablet en la red local durante el desarrollo.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
};
export default nextConfig;
