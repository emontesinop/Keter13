import Link from "next/link";
import { StateBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { getDcPatterns, getModels, getSymptoms } from "@/lib/knowledge";
import { date, splitList } from "@/lib/format";
import { modelsInFamily } from "@/lib/similar";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = { modelo?: string; familia?: string; sintoma?: string | string[]; patron?: string; q?: string; cerrados?: string };

export default async function History({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const models = getModels();
  const symptoms = getSymptoms();
  const dc = getDcPatterns();
  const modelo = sp.modelo ?? "";
  const familia = sp.familia === "1";
  const sintomas = ([] as string[]).concat(sp.sintoma ?? []).filter(Boolean);
  const patron = sp.patron ?? "";
  const q = (sp.q ?? "").trim();
  const cerrados = sp.cerrados === "1";
  const searched = Boolean(modelo || sintomas.length || patron || q || cerrados);

  const where: Prisma.OrderWhereInput = {
    ...(modelo ? { modelo: { in: familia ? modelsInFamily(modelo) : [modelo] } } : {}),
    ...(sintomas.length ? { AND: sintomas.map((s) => ({ sintomas: { contains: s } })) } : {}),
    ...(patron ? { dcReadings: { some: { patron } } } : {}),
    ...(cerrados ? { causaRaiz: { not: null } } : {}),
    ...(q
      ? { OR: [{ fallaReportada: { contains: q } }, { diagnosticoFinal: { contains: q } }, { causaRaiz: { contains: q } }, { notas: { contains: q } }, { codigo: { contains: q } }] }
      : {}),
  };
  const orders = await db.order.findMany({
    where,
    include: { customer: true, dcReadings: { select: { patron: true, mA: true } }, shortHunts: { select: { componenteHallado: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const names = Object.fromEntries(models.map((m) => [m.id, m.nombre]));
  const symLabel = (k: string) => symptoms.find((s) => s.key === k)?.label ?? k;
  const withCause = orders.filter((o) => o.causaRaiz);
  const tally = Object.entries(withCause.reduce<Record<string, number>>((a, o) => ((a[o.causaRaiz!] = (a[o.causaRaiz!] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const last = withCause[0];
  const patronLabel = dc.patrones.find((p) => p.id === patron)?.nombre;

  return (
    <div className="space-y-6">
      <h1 className="h1">Historial de casos</h1>
      <form className="panel space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="modelo">Modelo</label>
            <select id="modelo" name="modelo" defaultValue={modelo} className="input">
              <option value="">Todos</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <label className="mt-2 flex items-center gap-2 text-base">
              <input type="checkbox" name="familia" value="1" defaultChecked={familia} className="h-6 w-6" /> Incluir toda la familia (ej. 12, 12 mini, 12 Pro…)
            </label>
          </div>
          <div>
            <label className="label" htmlFor="patron">Consumo en fuente DC</label>
            <select id="patron" name="patron" defaultValue={patron} className="input">
              <option value="">Cualquiera</option>
              {dc.patrones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="q">Texto</label>
            <input id="q" name="q" defaultValue={q} className="input" placeholder="Falla, diagnóstico, componente…" />
          </div>
        </div>
        <div>
          <span className="label">Síntomas (todos los marcados)</span>
          <div className="flex flex-wrap gap-2">
            {symptoms.map((s) => (
              <label key={s.key} className="chip has-[:checked]:border-bench-accent has-[:checked]:bg-bench-accent/15 has-[:checked]:text-bench-accent">
                <input type="checkbox" name="sintoma" value={s.key} defaultChecked={sintomas.includes(s.key)} className="sr-only" />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-lg">
            <input type="checkbox" name="cerrados" value="1" defaultChecked={cerrados} className="h-6 w-6" /> Solo casos con causa raíz
          </label>
          <span className="flex-1" />
          <Link href="/historial" className="btn-secondary">Limpiar</Link>
          <button className="btn-primary">Buscar</button>
        </div>
      </form>

      {searched && withCause.length > 0 && (
        <section className="card space-y-2 border-bench-info">
          <h2 className="h2">Lo que te dicen tus casos</h2>
          {last && (
            <p className="text-xl">
              En {modelo ? (familia ? `la familia del ${names[modelo]}` : `el ${names[modelo]}`) : "estos equipos"}
              {sintomas.length ? ` con ${sintomas.map(symLabel).join(" + ").toLowerCase()}` : ""}
              {patronLabel ? ` y consumo “${patronLabel}”` : ""}, la última vez fue <b className="text-bench-accent">{last.causaRaiz}</b> (
              <Link href={`/ordenes/${last.id}`} className="font-mono text-bench-info underline">{last.codigo}</Link>, {date(last.updatedAt)}).
            </p>
          )}
          <ul className="space-y-1 text-lg">
            {tally.slice(0, 6).map(([c, n]) => (
              <li key={c}>
                <b>{c}</b> — {n} de {withCause.length} caso(s) ({Math.round((n / withCause.length) * 100)} %)
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="h2">{orders.length} orden(es)</h2>
        {orders.map((o) => (
          <Link key={o.id} href={`/ordenes/${o.id}`} className="card block space-y-1 hover:border-bench-accent">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-mono font-bold text-bench-accent">{o.codigo}</span> · <b>{names[o.modelo] ?? o.modelo}</b> · {date(o.createdAt)}
              </span>
              <StateBadge estado={o.estado} />
            </div>
            <p>{o.fallaReportada}</p>
            <p className="text-sm text-bench-muted">
              {splitList(o.sintomas).map(symLabel).join(" · ")}
              {o.dcReadings.length > 0 && ` · DC: ${[...new Set(o.dcReadings.map((d) => dc.patrones.find((p) => p.id === d.patron)?.nombre ?? d.patron))].join(", ")}`}
            </p>
            {o.causaRaiz && <p className="text-lg">Causa raíz: <b className="text-bench-ok">{o.causaRaiz}</b></p>}
            {o.shortHunts.some((h) => h.componenteHallado) && <p className="text-base">Corto: {o.shortHunts.map((h) => h.componenteHallado).filter(Boolean).join(", ")}</p>}
          </Link>
        ))}
      </section>
    </div>
  );
}
