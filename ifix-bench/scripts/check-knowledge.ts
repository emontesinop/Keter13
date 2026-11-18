// Valida todos los YAML de /knowledge desde la terminal: npm run lint:knowledge
import Module from "node:module";
// "server-only" lanza fuera de Next; aquí lo neutralizamos.
const orig = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (req: unknown, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return orig.call(this, req, ...rest);
};

async function main() {
  const { validateKnowledge } = await import("../src/lib/knowledge");
  const report = validateKnowledge();
  let bad = 0;
  for (const r of report) {
    console.log(`${r.ok ? "✔" : "✖"} ${r.file}${r.pendientes ? `  (${r.pendientes} por verificar)` : ""}`);
    for (const p of r.problems) console.log(`    - ${p}`);
    if (!r.ok) bad++;
  }
  console.log(bad ? `\n${bad} archivo(s) con errores.` : "\nTodo correcto.");
  process.exit(bad ? 1 : 0);
}
main();
