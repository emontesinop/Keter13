"use client";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";

export function DeleteButton({ action, label = "Borrar" }: { action: () => Promise<void>; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => confirm("¿Borrar este registro?") && start(() => action())}
      className="btn-secondary min-h-[3rem] px-3 text-base text-red-400"
    >
      <Trash2 className="h-5 w-5" /> {label}
    </button>
  );
}
