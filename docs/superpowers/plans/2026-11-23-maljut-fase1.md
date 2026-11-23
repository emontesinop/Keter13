# Maljut Fase 1 ("Primera semana") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** PWA instalable en iPhone con onboarding mínimo, botón "Tengo antojo" adaptativo, check-in, recaídas, contador, línea de tiempo y export cifrado.

**Architecture:** `maljut/` (Vite + React + TS + Tailwind). `src/core` puro y testeado con Vitest; `src/data` Dexie; `src/platform` adaptadores; `src/ui` pantallas. Despliegue: workflow de Pages combinado (StringArt en `/`, Maljut en `/maljut/`).

**Tech Stack:** React 18, TypeScript, Vite 5, Tailwind 3, Dexie 4, Framer Motion, vite-plugin-pwa, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-maljut-design.md`

## Global Constraints
- Todo el texto de UI en español natural vía `src/content/es.ts` (estructura lista para `en.ts`).
- Sin analítica ni red salvo carga de la app. Datos sólo en IndexedDB.
- Tono sin culpa; recaída nunca resetea XP ni "días limpios totales".
- `base: "./"` en Vite; botones ≥ 56px; tema oscuro.
- Sin `navigator.vibrate` asumido: `haptics.pulse()` hace no-op seguro + señal visual.

## Review Focus
- Fecha de inicio en el futuro → contador muestra 0 días, no negativos (test en Task 1).
- Recaída el mismo día del inicio → días en este intento = 0, totales no negativos (Task 1).
- Bandit sin datos → elige entre todos los brazos sin error (Task 2).
- Import con contraseña incorrecta → error claro, base intacta (Task 3).
- Check-in repetido el mismo día → se sobrescribe, no duplica (Task 3, clave = fecha).

---

### Task 1: Scaffold + core/domain
**Files:** `maljut/{package.json,vite.config.ts,index.html,tailwind.config.js,...}`, `src/core/domain/{counters,cudit,withdrawal}.ts`, tests en `src/core/**/*.test.ts`.
**Produces:**
- `computeCounters(quitAt: Date, lapses: {at: Date}[], now: Date, dailyCost: number) → {daysThisAttempt, cleanDaysTotal, cleanPct, moneySaved}`
- `CUDIT_ITEMS`, `scoreCudit(answers: number[]) → {score, band: 'low'|'hazardous'|'possible_cud'}` (≥8 hazardous, ≥12 possible_cud)
- `WITHDRAWAL_DAYS`, `expectedSymptoms(day: number) → {phase, intensity 0-1, symptoms[], note}`
- [ ] tests fallan → implementar → pasan → commit

### Task 2: core/engine bandit
**Files:** `src/core/engine/{interventions,bandit,context}.ts` + tests.
**Produces:** `INTERVENTIONS` (ids: `sigh`, `box`, `urge_surf`, `reasons`, `grounding`), `contextKey(date, intensity) → string`, `chooseIntervention(stats, ctx, rng) → id` (Thompson, prior Beta(1,1), mezcla global si contexto < 3 obs), `updateStats(stats, id, ctx, reward) → stats`, `rewardFrom(helped, before, after) → [0,1]`.
- [ ] tests (sin datos elige alguno válido; brazo con 20 éxitos gana >80% de 200 sorteos) → implementar → commit

### Task 3: data + platform
**Files:** `src/data/db.ts` (Dexie tablas del spec), `src/platform/{crypto,tts,haptics}.ts` + test de crypto.
**Produces:** `encryptJSON(obj, pass) → string`, `decryptJSON(str, pass) → obj` (lanza `WrongPassword`), `exportAll/importAll`.
- [ ] test roundtrip + contraseña incorrecta → implementar → commit

### Task 4: UI
Onboarding (edad 21+/consentimiento, consumo, fecha, CUDIT-R, porqués texto/foto), Hoy (contador, línea de tiempo del día, check-in, botón antojo), Crisis (intensidad→emoción→contexto opcional→intervención→¿funcionó?), Bitácora (antojos, check-ins, recaídas + registro de recaída), Ajustes (export/import, borrar todo).
- [ ] `npm run build` limpio; prueba manual con Playwright en viewport iPhone → commit

### Task 5: Deploy
Workflow de Pages combinado. Push a la rama.
