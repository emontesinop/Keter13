import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "soft" | "danger";
const styles: Record<Variant, string> = {
  primary: "bg-calm text-bg font-semibold",
  soft: "bg-card border border-line text-ink",
  ghost: "text-mute",
  danger: "bg-card border border-red-900 text-red-300",
};

export function Btn({ variant = "primary", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...p}
      className={`min-h-14 w-full rounded-2xl px-5 text-lg active:scale-[0.98] transition disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-card border border-line p-5 ${className}`}>{children}</div>;
}

export function Chips({ options, value, onChange, multi = true }: { options: string[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(multi ? (on ? value.filter((x) => x !== o) : [...value, o]) : on ? [] : [o])}
            className={`min-h-12 rounded-full px-4 text-base border transition ${on ? "bg-calm/20 border-calm text-ink" : "bg-card border-line text-mute"}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Fila de botones 1..n, grande para el pulgar. */
export function Scale({ n = 5, value, onChange, low, high }: { n?: number; value?: number; onChange: (v: number) => void; low?: string; high?: string }) {
  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(n, 5)}, minmax(0, 1fr))` }}>
        {Array.from({ length: n }, (_, i) => i + 1).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`h-14 rounded-2xl text-lg border transition ${value === v ? "bg-calm text-bg border-calm font-semibold" : "bg-card border-line text-ink"}`}
          >
            {v}
          </button>
        ))}
      </div>
      {(low || high) && (
        <div className="flex justify-between text-xs text-mute mt-1 px-1">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      )}
    </div>
  );
}

export function Screen({ title, onBack, children, footer }: { title?: string; onBack?: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col safe-top">
      {(title || onBack) && (
        <header className="flex items-center gap-2 px-4 pb-3">
          {onBack && (
            <button onClick={onBack} className="h-12 w-12 -ml-2 rounded-full text-2xl text-mute" aria-label="Volver">
              ‹
            </button>
          )}
          {title && <h1 className="text-xl font-semibold">{title}</h1>}
        </header>
      )}
      <main className="flex-1 px-4 pb-6 space-y-4">{children}</main>
      {footer && <div className="px-4 safe-bottom pt-2 space-y-2 sticky bottom-0 bg-bg/95 backdrop-blur">{footer}</div>}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="text-sm text-mute mb-2">{children}</p>;
}
