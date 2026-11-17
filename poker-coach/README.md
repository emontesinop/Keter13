# Poker Coach

Entrenador personal de No-Limit Hold'em cash (en vivo, 1/2 y 1/3). Incluye diagnóstico, currículo por niveles con gate de aprobación, drills procedurales y registro de sesiones.

> La app mide, no garantiza. Los resultados se muestran con su tamaño de muestra y su intervalo de confianza.

## Correr

```bash
cd poker-coach
pip install -r requirements.txt
python run.py
```

Abre http://localhost:8000. Desde el celular, en la misma wifi, usa la URL que imprime la consola (`http://<IP>:8000`).

Tests: `python -m pytest -q`

## Stack

- **FastAPI + SQLModel/SQLite**: un archivo de base de datos (`data/poker.db`) y un solo comando para arrancar.
- **Jinja2 + CSS propio**: no hay build de frontend y es mobile-first, con modo oscuro automático.
- **treys**: evaluador de manos probado. La equity se calcula con enumeración exacta (flop/turn/river) o Monte Carlo (preflop).
- **Gráficas**: SVG generado en el servidor, sin dependencias ni internet.

## Estructura

```
app/core/      lógica pura y testeada: cartas, rangos, equity, pot odds/EV/MDF, estadísticas
app/drills/    generadores procedurales; cada pregunta se regenera de forma determinista con (tipo, semilla)
app/progress.py  gates, diagnóstico, exámenes, puntajes por habilidad, recomendación diaria
content/       TODO el contenido editable (YAML): lecciones, preguntas, rangos, fuentes, configuración
tests/         tests de lógica crítica e integración web
```

## Editar contenido

- `content/ranges/*.yaml`: rangos preflop (aproximados para 100 bb en vivo). Al arrancar se valida la sintaxis, que el RFI sea monótono por posición y que no haya solapes entre 3-bet y call.
- `content/lessons/levelN.yaml`: lecciones con concepto, ejemplo, fuentes y los drills que practican.
- `content/questions/*.yaml`: preguntas conceptuales fijas.
- `content/config.yaml`: tamaños en vivo, parámetros del gate y del bankroll.

Si algo está mal escrito, la app no arranca y dice exactamente qué y dónde.

## Gate de nivel

Para aprobar un nivel necesitas ≥ 85 % en tus últimos 50 ejercicios de práctica de ese nivel y aprobar un examen de 20 preguntas con ≥ 85 %.

El diagnóstico puede convalidar un nivel: si aciertas ≥ 85 % de sus preguntas, puedes presentar su examen directamente. Si lo suspendes, vuelves al gate normal.

## Estado

- Iteración 1 (MVP): diagnóstico, niveles 0-1, drills de matemática y preflop, gate y examen, sesiones en vivo.
- Iteración 2: repetición espaciada SM-2 (`/repasar` e intercalada en la práctica), check-in mental pre/post y panel de correlación con resultados.
- Iteración 3: nivel 2 (postflop) y nivel 3 (lectura de manos) con drills calculados con treys.
- Próximas: analizador de manos y panel de leaks, niveles 4-5.

## Cómo se calculan las respuestas postflop

No hay solver. Cada spot postflop usa un **modelo explícito del rival**: su rango de call preflop de `content/ranges` más un perfil (`app/drills/postflop.py`) que fija qué fracción paga, apuesta por valor o farolea. Con ese modelo, treys calcula de forma exacta la equity en el river y el EV de cada opción. La explicación de cada ejercicio muestra el modelo y los números.

## Repetición espaciada

Cada error crea (o reinicia) una tarjeta por tipo de ejercicio. La situación exacta vuelve en unos 10 minutos. Después vuelven variantes nuevas a 1, 6, 15… días según el algoritmo SM-2. La calidad de la respuesta sale del acierto y del tiempo: rápido = 5, normal = 4, lento = 3, error = 1. Los repasos cuentan para el gate del nivel.
