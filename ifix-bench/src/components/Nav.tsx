"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home, PlusCircle, Settings, Stethoscope } from "lucide-react";
import { cn } from "@/lib/format";

const items = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/ordenes", label: "Órdenes", icon: ClipboardList },
  { href: "/ordenes/nueva", label: "Recibir", icon: PlusCircle },
  { href: "/diagnostico", label: "Diagnóstico", icon: Stethoscope },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" : href === "/ordenes" ? path.startsWith("/ordenes") && path !== "/ordenes/nueva" : path.startsWith(href);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-bench-line bg-bench-panel/95 backdrop-blur
        md:inset-y-0 md:left-0 md:right-auto md:w-24 md:flex-col md:border-r md:border-t-0 md:pt-4 print:hidden"
    >
      <div className="hidden pb-4 text-center text-sm font-black leading-tight text-bench-accent md:block">
        iFix
        <br />
        Bench
      </div>
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs font-semibold md:flex-none md:py-4",
            active(href) ? "text-bench-accent" : "text-bench-muted hover:text-bench-text",
          )}
        >
          <Icon className="h-7 w-7" strokeWidth={2.2} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
