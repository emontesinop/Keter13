import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "iFix Bench",
  description: "Asistente de taller para reparación de iPhone",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0d10" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-10 md:pl-32 md:pr-8">{children}</main>
      </body>
    </html>
  );
}
