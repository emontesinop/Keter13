"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

export function Tabs({ tabs }: { tabs: { href: string; label: string; badge?: string }[] }) {
  const path = usePathname();
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-bench-line pb-0">
      {tabs.map((t, i) => {
        const on = i === 0 ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex min-h-touch shrink-0 items-center gap-2 border-b-4 px-5 text-lg font-semibold",
              on ? "border-bench-accent text-bench-text" : "border-transparent text-bench-muted hover:text-bench-text",
            )}
          >
            {t.label}
            {t.badge && <span className="rounded-md bg-bench-line px-2 py-0.5 text-sm">{t.badge}</span>}
          </Link>
        );
      })}
    </div>
  );
}
