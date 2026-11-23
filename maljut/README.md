# Maljut

Compañero práctico para dejar el cannabis. PWA local-first: todos los datos viven en el teléfono (IndexedDB).

- Diseño: `docs/superpowers/specs/2026-11-23-maljut-design.md`
- Plan fase 1: `docs/superpowers/plans/2026-11-23-maljut-fase1.md`

## Desarrollo

```bash
cd maljut
npm install
npm test        # motor adaptativo, contadores, CUDIT-R, cifrado
npm run dev     # http://localhost:5173
npm run build   # dist/
```

## Estructura

- `src/core/` — lógica pura (portable a React Native): contadores, CUDIT-R, curva de abstinencia, bandit.
- `src/content/` — textos en español (`es.ts`), listos para i18n.
- `src/data/` — Dexie (IndexedDB), export/import.
- `src/platform/` — cifrado (WebCrypto), voz (Web Speech), tonos/vibración.
- `src/ui/` — pantallas React.

## Publicación

El workflow `.github/workflows/pages.yml` publica en GitHub Pages: StringArt en `/` y Maljut en `/maljut/`
cada vez que hay cambios en `main`.
