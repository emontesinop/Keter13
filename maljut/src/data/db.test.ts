import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { MaljutDB, exportAll, importAll } from "./db";
import { encryptJSON, decryptJSON, WrongPassword } from "../platform/crypto";

describe("cifrado", () => {
  it("roundtrip con la contraseña correcta", async () => {
    const s = await encryptJSON({ hola: "mundo", n: [1, 2] }, "secreta");
    expect(s).not.toContain("mundo");
    expect(await decryptJSON(s, "secreta")).toEqual({ hola: "mundo", n: [1, 2] });
  });
  it("contraseña incorrecta lanza WrongPassword", async () => {
    const s = await encryptJSON({ a: 1 }, "buena");
    await expect(decryptJSON(s, "mala")).rejects.toBeInstanceOf(WrongPassword);
  });
});

describe("base local", () => {
  it("check-in del mismo día se sobrescribe", async () => {
    const db = new MaljutDB("t1");
    const c = { date: "2026-11-23", at: 1, mood: 2, sleep: 2, anxiety: 3, irritability: 3, appetite: 2, cravings: 4, used: false };
    await db.checkins.put(c);
    await db.checkins.put({ ...c, mood: 4 });
    expect(await db.checkins.count()).toBe(1);
    expect((await db.checkins.get("2026-11-23"))?.mood).toBe(4);
  });

  it("export → cifrado → import restaura todo; contraseña mala no toca la base", async () => {
    const a = new MaljutDB("t2");
    await a.reasons.add({ at: 1, text: "Mi hija" });
    await a.cravings.add({ at: 2, intensity: 8, ctxKey: "noche:alta", used: false });
    const file = await encryptJSON(await exportAll(a), "pw");

    const b = new MaljutDB("t3");
    await b.reasons.add({ at: 9, text: "previo" });
    await expect(decryptJSON(file, "otra")).rejects.toBeInstanceOf(WrongPassword);
    expect(await b.reasons.count()).toBe(1);

    await importAll(b, await decryptJSON(file, "pw"));
    expect((await b.reasons.toArray()).map((r) => r.text)).toEqual(["Mi hija"]);
    expect(await b.cravings.count()).toBe(1);
  });
});
