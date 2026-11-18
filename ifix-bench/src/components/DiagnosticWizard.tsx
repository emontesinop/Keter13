"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ArrowLeft, RotateCcw, Save } from "lucide-react";
import { saveDiagnosticSession, type PathStep } from "@/app/actions";
import { TOOLS } from "@/lib/constants";
import { cn } from "@/lib/format";
import type { DcPatterns, Safety, Tree } from "@/lib/knowledge-schemas";
import type { DcCase } from "@/lib/similar";
import { DcConsumption } from "./DcConsumption";
import { SafetyBanner, VerifyBadge } from "./ui";

export function DiagnosticWizard({
  trees,
  startTree,
  startNode,
  safety,
  orderId,
  orderLabel,
  dc,
  dcHistory,
  modelNames,
}: {
  trees: Record<string, Tree>;
  startTree: string;
  startNode?: string;
  safety: Safety["avisos"];
  orderId: string | null;
  orderLabel: string | null;
  dc: DcPatterns | null;
  dcHistory: Record<string, DcCase[]>;
  modelNames: Record<string, string>;
}) {
  const router = useRouter();
  const first = trees[startTree];
  const initial: PathStep = { arbol: startTree, nodo: startNode && first.nodos[startNode] ? startNode : first.inicio };
  const [path, setPath] = useState<PathStep[]>([initial]);
  const [showDc, setShowDc] = useState(false);
  const [pending, start] = useTransition();
  const [savedId, setSavedId] = useState<string | null>(null);

  const cur = path[path.length - 1];
  const tree = trees[cur.arbol];
  const node = tree?.nodos[cur.nodo];

  const updateCur = (patch: Partial<PathStep>) => setPath((p) => [...p.slice(0, -1), { ...p[p.length - 1], ...patch }]);

  const choose = useCallback(
    (i: number) => {
      const opt = node?.opciones?.[i];
      if (!opt) return;
      const nextStep: PathStep | null = opt.arbol
        ? trees[opt.arbol]
          ? { arbol: opt.arbol, nodo: opt.nodo && trees[opt.arbol].nodos[opt.nodo] ? opt.nodo : trees[opt.arbol].inicio }
          : null
        : opt.siguiente
          ? { arbol: cur.arbol, nodo: opt.siguiente }
          : null;
      if (!nextStep) return;
      setShowDc(false);
      setSavedId(null);
      setPath((p) => [...p.slice(0, -1), { ...p[p.length - 1], opcion: opt.texto }, nextStep]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [node, trees, cur.arbol],
  );

  const back = useCallback(() => {
    setSavedId(null);
    setPath((p) => (p.length > 1 ? [...p.slice(0, -2), { ...p[p.length - 2], opcion: undefined }] : p));
  }, []);

  // Teclado: 1-9 eligen opción, Backspace/← vuelve atrás (fuera de campos de texto).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (/^[1-9]$/.test(e.key)) choose(Number(e.key) - 1);
      if (e.key === "Backspace" || e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [choose, back]);

  if (!tree || !node) {
    return (
      <div className="rounded-xl border-2 border-red-500 bg-red-950/60 p-4">
        Nodo “{cur.nodo}” no encontrado en el árbol “{cur.arbol}”. Revisa el YAML.
        <button className="btn-secondary ml-4" onClick={back}>Volver</button>
      </div>
    );
  }

  const isEnd = node.tipo === "conclusion";
  const tool = node.herramienta ? TOOLS[node.herramienta] : null;

  const save = () =>
    start(async () => {
      const id = await saveDiagnosticSession({
        orderId,
        arbol: startTree,
        ruta: path,
        conclusion: isEnd ? `${cur.arbol}:${cur.nodo}` : null,
        resumen: isEnd ? node.titulo : `En curso: ${node.titulo}`,
      });
      setSavedId(id);
      if (orderId) router.push(`/ordenes/${orderId}/diagnostico?guardado=1`);
    });

  const goTo = node.ir_a;
  const goHref = goTo?.arbol && trees[goTo.arbol] ? `/diagnostico/${goTo.arbol}${orderId ? `?orden=${orderId}` : ""}` : null;

  return (
    <div className="space-y-5">
      {/* Ruta recorrida */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {orderLabel && <span className="rounded-md bg-bench-accent px-2 py-1 font-mono font-bold text-black">{orderLabel}</span>}
        {path.map((s, i) => (
          <span key={i} className={cn("rounded-md px-2 py-1", i === path.length - 1 ? "bg-bench-line font-bold" : "text-bench-muted")}>
            {s.arbol !== startTree && i > 0 && path[i - 1].arbol !== s.arbol ? `↪ ${trees[s.arbol]?.titulo}: ` : ""}
            {trees[s.arbol]?.nodos[s.nodo]?.titulo ?? s.nodo}
          </span>
        ))}
      </div>

      <div className={cn("rounded-3xl border-4 p-6 md:p-8", isEnd ? "border-bench-ok bg-green-950/30" : "border-bench-accent/60 bg-bench-card")}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold uppercase tracking-wider text-bench-muted">
            {isEnd ? "Conclusión" : node.tipo === "medicion" ? "Medición" : "Pregunta"} · {tree.titulo}
          </span>
          <VerifyBadge show={!node.verificado} />
        </div>
        <h2 className="text-3xl font-black leading-tight md:text-4xl">{node.titulo}</h2>

        {tool && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-bench-bg px-4 py-2 text-xl font-bold">
            <span aria-hidden>{tool.emoji}</span> {tool.label}
          </p>
        )}
        {node.instruccion && <p className="mt-4 text-xl leading-relaxed md:text-2xl">{node.instruccion}</p>}

        {node.medir && (
          <div className="mt-5 grid gap-3 rounded-2xl bg-bench-bg p-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase text-bench-muted">Qué medir</p>
              <p className="text-lg">{node.medir}</p>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase text-bench-muted">Valor esperado</p>
              {node.valor_esperado ? (
                <p className="text-lg font-bold text-bench-ok">{node.valor_esperado}</p>
              ) : (
                <p className="text-base text-yellow-300">Sin valor de referencia. Compara con tu placa buena y anótalo en el YAML (campo valor_esperado).</p>
              )}
            </div>
            <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
              <input className="input" placeholder="Valor medido (ej. 0.45 V diodo, 12 Ω)" value={cur.valor ?? ""} onChange={(e) => updateCur({ valor: e.target.value })} />
              <input className="input" placeholder="Nota" value={cur.nota ?? ""} onChange={(e) => updateCur({ nota: e.target.value })} />
            </div>
          </div>
        )}

        {node.seguridad?.length ? (
          <div className="mt-5 space-y-2">
            {node.seguridad.map((s) => safety[s] && <SafetyBanner key={s} aviso={safety[s]} open={s === "inyeccion"} />)}
          </div>
        ) : null}

        {isEnd && (
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <p className="h3 mb-2">Causas probables</p>
              <ul className="list-disc space-y-1 pl-6 text-xl">{node.causas?.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
            <div>
              <p className="h3 mb-2">Qué hacer</p>
              <ol className="list-decimal space-y-1 pl-6 text-xl">{node.acciones?.map((c) => <li key={c}>{c}</li>)}</ol>
            </div>
          </div>
        )}
      </div>

      {node.abrir_consumo && dc && (
        <div className="panel">
          <button type="button" className="btn-secondary w-full" onClick={() => setShowDc((v) => !v)}>
            ⚡ {showDc ? "Ocultar registro de consumo DC" : "Registrar consumo DC aquí"}
          </button>
          {showDc && (
            <div className="mt-4">
              <DcConsumption dc={dc} orderId={orderId} history={dcHistory} modelNames={modelNames} compact />
            </div>
          )}
        </div>
      )}

      {!isEnd && (
        <div className="grid gap-3">
          {node.opciones?.map((o, i) => (
            <button key={i} type="button" onClick={() => choose(i)} className="btn btn-xl min-h-[5rem] justify-start border-2 border-bench-line bg-bench-panel text-left hover:border-bench-accent">
              <span className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bench-line font-mono text-lg">{i + 1}</span>
              <span className="flex-1">{o.texto}</span>
              {o.arbol && <span className="text-base text-bench-info">↪ {trees[o.arbol]?.titulo ?? o.arbol}</span>}
            </button>
          ))}
        </div>
      )}

      {isEnd && goTo && (
        <div className="panel">
          {goHref ? (
            <Link href={goHref} className="btn-secondary btn-xl w-full">
              Continuar con: {trees[goTo.arbol!].titulo} →
            </Link>
          ) : goTo.modulo === "cortos" ? (
            <Link href={`/placa${orderId ? `?orden=${orderId}` : ""}`} className="btn-secondary btn-xl w-full">
              Ir a localización de cortocircuitos →
            </Link>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={back} disabled={path.length < 2} className="btn-secondary btn-xl flex-1">
          <ArrowLeft className="h-6 w-6" /> Atrás
        </button>
        <button type="button" onClick={() => { setPath([initial]); setSavedId(null); }} className="btn-secondary btn-xl">
          <RotateCcw className="h-6 w-6" /> Reiniciar
        </button>
        <button type="button" onClick={save} disabled={pending || !!savedId} className={cn("btn-xl flex-1", isEnd ? "btn-ok" : "btn-secondary")}>
          <Save className="h-6 w-6" /> {savedId ? "✔ Guardado" : pending ? "Guardando…" : orderId ? (isEnd ? "Guardar en la orden" : "Guardar progreso") : "Guardar (sin orden)"}
        </button>
      </div>
      <p className="text-center text-sm text-bench-muted">Teclado: 1–9 eligen una opción · Retroceso vuelve atrás</p>
    </div>
  );
}
