"use client";
import { useState } from "react";
import { cn } from "@/lib/format";
import type { Safety } from "@/lib/knowledge-schemas";
import { SafetyBanner } from "./ui";

export function ChipPicker({
  name,
  options,
  defaultValue = [],
  safety = {},
}: {
  name: string;
  options: { key: string; label: string; aviso?: string }[];
  defaultValue?: string[];
  safety?: Safety["avisos"];
}) {
  const [sel, setSel] = useState<string[]>(defaultValue);
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const avisos = [...new Set(options.filter((o) => o.aviso && sel.includes(o.key)).map((o) => o.aviso!))];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button type="button" key={o.key} onClick={() => toggle(o.key)} className={cn("chip", sel.includes(o.key) && "chip-on")} aria-pressed={sel.includes(o.key)}>
            {sel.includes(o.key) ? "✓ " : ""}
            {o.label}
          </button>
        ))}
      </div>
      <input type="hidden" name={`${name}__present`} value="1" />
      {sel.map((k) => (
        <input key={k} type="hidden" name={name} value={k} />
      ))}
      {avisos.map((a) => safety[a] && <SafetyBanner key={a} aviso={safety[a]} open />)}
    </div>
  );
}
