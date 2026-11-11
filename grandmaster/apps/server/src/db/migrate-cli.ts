import { createDb, migrate } from "./index";
const db = await createDb();
await migrate(db);
console.log(`Migrations applied (${db.kind}).`);
await db.close();
