# Maljut — Documento de diseño

Fecha: 2026-11-23 · Estado: aprobado (paso 1)

## Intención
App personal (después pública) para dejar el cannabis. Compañero práctico —coach,
bitácora inteligente y caja de herramientas—, no terapeuta. Aprende de los patrones
del usuario. Tono directo, cálido, sin culpa: una recaída es un dato.

Usuario inicial: consumo diario (2 porros/vape), 10 años, corte total inmediato,
iPhone, EE. UU., gasto ≈ $30–60/semana (usamos $45/sem ≈ $6,43/día por defecto, editable).

## Objetivos / no-objetivos / anti-objetivos
- Objetivo fase 1: sobrevivir la primera semana (pico de abstinencia días 2–6).
- No-objetivos v1: ML pesado, backend con datos del usuario, chat terapéutico.
- Anti-objetivos: moralizar; resetear el progreso a cero tras una recaída; recomendar
  psicodélicos/ibogaína/ayahuasca; afirmaciones médicas ("cura").

## Restricciones
- iPhone: la PWA no puede vibrar (sin `navigator.vibrate` en iOS). Compensar con
  señal visual + tono suave. Notificaciones sólo con la app instalada (iOS 16.4+).
- Local-first: IndexedDB (Dexie). Nada de analítica. Borrado total real.
- Avisos preventivos (fase 3): Web Push desde un servidor mínimo que sólo guarda la
  suscripción y las horas; envía un texto genérico. Ningún dato de consumo sale.

## Enfoques considerados (hosting)
1. **GitHub Pages en este repo (elegido).** Ya hay un workflow de Pages para
   StringArt; se amplía para publicar ambas apps (StringArt en `/`, Maljut en `/maljut/`).
   Cero cuentas nuevas. Contra: despliega desde `main` (requiere merge) y comparte
   origen con StringArt (aceptable para uso personal; para lanzamiento público:
   dominio propio).
2. Cloudflare Pages: previews por rama, y el Worker de push vive en el mismo sitio.
   Contra: requiere crear/conectar cuenta ahora. Se usará sólo para el Worker en fase 3.
3. Vercel/Netlify: equivalentes a 2, sin ventaja clara.

## Arquitectura
```
maljut/src/
  core/      TS puro (portable a React Native): engine/ (riesgo, bandit, reglas),
             domain/ (CUDIT-R, contadores, dinero, curva de abstinencia, XP)
  content/   textos ES (i18n listo para EN)
  data/      Dexie + repositorios
  platform/  háptica/señal, TTS, cifrado, notificaciones
  ui/        React + Tailwind + Framer Motion
```
PWA con vite-plugin-pwa (offline). Export/import cifrado con WebCrypto
(PBKDF2 → AES-GCM). Tests Vitest sobre `core/`.

## Modelo de datos
profile, assessments (CUDIT-R), reasons, cravings, armStats (α/β por
intervención×contexto), checkins (clave = fecha), lapses, toolSessions,
cbtEntries, progress, settings. Ver detalle en el mensaje de diseño del paso 1.

Recaídas: se muestran "días en este intento", "días limpios totales" y
"% de días limpios". XP y nivel nunca bajan.

## Motor adaptativo v1
- Mapa de riesgo 7×24 con prior de las horas declaradas (madrugada, antes/después
  del trabajo, antes de dormir) y suavizado bayesiano.
- Thompson sampling por contexto (franja horaria × intensidad) con fallback a
  la estadística global. Recompensa: sí=1, algo=0,5, no=0 (+ caída de intensidad).
  Filtros por reglas (hora, duración disponible).

## Fases
1. Primera semana: PWA desplegada, onboarding mínimo (consumo, CUDIT-R, porqués
   texto+foto, fecha), botón "Tengo antojo" con 5 intervenciones + bandit,
   check-in, recaídas, contador días/dinero, línea de tiempo, export cifrado.
2. Caja de herramientas completa. 3. Motor completo + push. 4. Progreso/informe.
5. Raíces, juegos, planes alternativos. 6. Preparación pública (EN, legal, PIN,
   reducción gradual, edad configurable por país). 7. Coach Claude opcional.

## Decisiones dejadas al constructor
Estructura de componentes, librerías menores, copy exacto (español natural),
paleta oscura calmada.
