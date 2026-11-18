"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn-primary", confirm: ask }: { children: React.ReactNode; className?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (ask && !window.confirm(ask)) e.preventDefault();
      }}
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}
