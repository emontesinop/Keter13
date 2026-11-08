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

## Próximas fases
- Fase 2: localización de cortocircuitos y registro de modo diodo por línea, guías paso a paso con
  modo manos libres, inventario, historial con búsqueda por modelo y síntoma, más árboles.
- Fase 3: análisis de fotos y chat con Claude, programación de piezas, checklist de salida y nota
  de entrega en PDF.
