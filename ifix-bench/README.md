# iFix Bench

Asistente de mesa de trabajo para reparación de iPhone (8 → 17): recepción, checklist,
diagnóstico guiado y registro de mediciones. Funciona 100 % en local (Next.js + SQLite).

## Arrancar

Requisitos: **Node.js 20 o superior**.

```bash
cd ifix-bench
npm install        # solo la primera vez
npm run dev        # prepara la base de datos y arranca en http://localhost:3000
```

Para el uso diario (más rápido, sobre todo en la tablet):

```bash
npm run bench      # compila y arranca en modo producción
```

### Abrirla desde la tablet
La app escucha en toda la red local. Busca la IP de tu laptop
(`ipconfig` en Windows, `ifconfig` / Ajustes de red en macOS/Linux) y abre en la tablet:
`http://IP-DE-LA-LAPTOP:3000`. Ambos equipos deben estar en la misma red Wi-Fi.
En la tablet, “Añadir a pantalla de inicio” la deja como una app a pantalla completa.

## Dónde están los datos

| Qué | Dónde |
|---|---|
| Base de datos (órdenes, clientes, mediciones, ajustes) | `data/ifix.db` |
| Fotos | `data/uploads/<orden>/` |
| Tus esquemáticos / boardviews subidos | `data/library/` |
| Base de conocimiento editable | `knowledge/` (ver `knowledge/README.md`) |

**Copia de seguridad:** copia la carpeta `data/` con la app detenida.
No borres `data/ifix.db` con la app en marcha.

Ver o editar la base de datos a mano: `npm run db:studio`.
Comprobar los YAML de conocimiento: `npm run lint:knowledge`.

## Fase 1 (lista)

- **Recepción**: cliente, modelo, IMEI/serie, código del equipo, falla, síntomas, estado físico,
  presupuesto, fotos de entrada (cámara de la tablet), ruta a tu boardview local.
- **Bloqueo de iCloud**: la orden queda marcada en rojo y no puede pasar a Reparando / Pruebas /
  Listo / Entregado hasta registrar y verificar la prueba de propiedad. No hay ningún método
  para saltar bloqueos.
- **Checklist de entrada**: 4 botones grandes por ítem (OK / Falla / No probado / N/A), notas,
  se guarda al instante; oculta Face ID o Touch ID según el modelo.
- **Asistente de diagnóstico**: árboles *No enciende*, *No carga*, *Sin imagen*. Herramienta,
  qué medir, valor esperado (vacío para que lo llenes tú), campo para el valor medido, avisos de
  seguridad, saltos entre árboles, teclado (1–9 / Retroceso). La ruta completa se guarda en la orden.
- **Consumo en fuente DC**: patrón de amperaje → causas probables + **tus casos anteriores** del mismo
  modelo/familia con ese patrón (se alimenta del campo “Causa raíz” al cerrar cada caso).
- **Avisos visibles**: ESD, batería de litio (al marcar batería hinchada), límites de inyección.
- **Ajustes**: datos del taller, moneda, garantía, API key de Claude (para la Fase 3) y estado de
  validación de cada archivo de conocimiento.

## Fase 2 (lista)

- **Placa → Localizar cortocircuito**: flujo guiado de 10 pasos (preparar, medir, inspeccionar,
  inyectar con límite, térmica, colofonia, alcohol, aislar, reemplazar, verificar). Si llenas
  `inyeccion_max_v` / `inyeccion_max_a` de una línea en `knowledge/reference-lines.yaml`, la app
  **bloquea** registrar una inyección por encima de tu límite.
- **Mediciones por línea** (modo diodo, resistencia, voltaje) con conversión de unidades. Las que marcas
  como “placa buena” forman tus **valores de referencia** (Placa → Valores de referencia) y cada
  medición nueva se compara en vivo (diferencia en %; se resalta por encima de ±10 %, umbral orientativo).
- **Guías paso a paso** (`knowledge/guides/`): tornillos, advertencias, temperaturas, checklist por paso,
  cronómetro y progreso guardado por orden. **Modo manos libres**: paso a pantalla completa, avanzar
  tocando la pantalla (izquierda = atrás) o con la barra espaciadora, pantalla siempre encendida.
- **Inventario**: stock, mínimo, costo, precio, proveedor, ubicación y modelos compatibles. Usar una
  pieza en una orden descuenta el stock (y quitarla lo devuelve). Muestra costo de piezas y margen.
- **Historial**: búsqueda por modelo (o familia), síntomas, patrón de consumo DC y texto, con resumen
  “la última vez fue…” y causas más frecuentes. Cada orden muestra órdenes parecidas.
- **Biblioteca de esquemáticos**: sube TUS archivos (o enlaza su ruta) y asígnalos a modelos; cada orden
  muestra los de su modelo. La app no incluye esquemáticos con copyright.
- **6 árboles nuevos**: se reinicia en bucle, sin touch, sin audio, sin señal, Face ID, se calienta.
- Moneda por defecto: **USD**.

## Fase 3 (lista)

- **Análisis de fotos con IA** (pestaña IA de la orden): elige una foto de la orden o toma una nueva;
  la imagen se reduce en el navegador y Claude devuelve hallazgos estructurados (corrosión, quemado,
  faltante, flex roto, pieza no original…) con severidad, confianza, ubicación y recomendaciones.
  Se guardan en la orden y entran al contexto del chat.
- **Chat de diagnóstico** con el contexto completo de la orden (modelo, síntomas, checklist, recorrido
  del diagnóstico, consumo DC, mediciones vs. tus referencias, cortos, piezas y casos parecidos del
  historial). Respuesta en streaming; la conversación se guarda por orden.
- **API key**: Ajustes → Análisis con IA. Sin key el módulo se desactiva y todo lo demás funciona.
  Modelo: Claude Opus 5.5 (`claude-opus-5-5`), con *fallback* del lado del servidor activado: si un
  filtro de seguridad rechaza una consulta legítima, la API la reintenta con otro modelo.
- **Programación de piezas** (`knowledge/programming.yaml`): batería, True Tone, Face ID, cámaras y
  Touch ID por modelo, mensaje que aparece si no se programa y pasos generales. Sin ningún contenido
  para saltar iCloud, operador o cuentas.
- **Entrega**: checklist de salida con el resultado de entrada al lado, resumen antes/después
  (reparado, empeoró, sigue fallando), alerta si algo que funcionaba ahora falla, fotos de salida,
  garantía (días por defecto y condiciones en Ajustes) y **nota de entrega en PDF** imprimible.
  Una orden con bloqueo de iCloud sin prueba de propiedad no se puede entregar.
