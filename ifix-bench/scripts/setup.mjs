// Prepara la carpeta de datos y aplica migraciones antes de arrancar.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "data", "uploads"), { recursive: true });

console.log("▶ iFix Bench: preparando base de datos local…");
execSync("npx prisma migrate deploy", { cwd: root, stdio: "inherit" });
console.log("✔ Base de datos lista en data/ifix.db");
