// Copies the Stockfish 18 lite single-threaded WASM build into public/engine so the
// browser can load it in a Web Worker (no COOP/COEP headers required).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
let pkgDir;
try { pkgDir = path.dirname(require.resolve("stockfish/package.json")); } catch { console.warn("stockfish package not installed yet"); process.exit(0); }
const out = path.join(here, "..", "public", "engine");
fs.mkdirSync(out, { recursive: true });
for (const f of ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"]) {
  fs.copyFileSync(path.join(pkgDir, "bin", f), path.join(out, f));
}
fs.copyFileSync(path.join(pkgDir, "Copying.txt"), path.join(out, "STOCKFISH-LICENSE-GPL3.txt"));
console.log("Stockfish WASM copied to", out);
