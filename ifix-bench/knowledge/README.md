# Base de conocimiento de iFix Bench

Todo lo que hay en esta carpeta es **editable por ti**. La app lee estos archivos
cada vez que abre una pantalla: guardas el archivo, recargas y ves el cambio.

- Todo el contenido inicial viene marcado con `estado: verificar` / `verificado: false`.
  La app muestra una etiqueta amarilla **VERIFICAR** hasta que lo revises y cambies
  a `verificado: true` (o `estado: verificado` a nivel de archivo).
- **No hay valores de medición exactos.** Los campos `valor_esperado` están vacíos
  a propósito: llénalos con tus mediciones reales de placas buenas.
- No se incluyen esquemáticos ni boardviews. Cada orden tiene un campo para enlazar
  un archivo local tuyo.
- Si un archivo tiene un error de formato, la pantalla **Ajustes → Base de conocimiento**
  te dice cuál y en qué campo.

Comprobar todo desde la terminal: `npm run lint:knowledge`

| Archivo | Contenido |
|---|---|
| `models.yaml` | Modelos de iPhone (8 → 17) |
| `checklist.yaml` | Ítems del checklist de entrada/salida |
| `physical.yaml` | Opciones de estado físico en la recepción |
| `symptoms.yaml` | Síntomas y el árbol de diagnóstico que abre cada uno |
| `safety.yaml` | Avisos de seguridad (ESD, litio, inyección, calor) |
| `dc-consumption.yaml` | Patrones de consumo en fuente DC → causas probables |
| `diagnostics/*.yaml` | Árboles de decisión |

## Formato de un árbol de diagnóstico

```yaml
id: no-carga            # igual al nombre del archivo
titulo: No carga
estado: verificar
inicio: n1              # primer nodo
nodos:
  n1:
    tipo: pregunta      # pregunta | medicion | conclusion
    titulo: ...
    instruccion: ...
    herramienta: multimetro   # multimetro | fuente_dc | camara_termica | microscopio | medidor_usb | visual | pc | ninguna
    medir: qué medir exactamente (solo en tipo medicion)
    valor_esperado: ""  # TU valor de placa buena
    seguridad: [inyeccion]    # ids de safety.yaml
    abrir_consumo: true       # muestra el botón del registro de consumo DC
    verificado: false
    opciones:
      - texto: Sí
        siguiente: n2         # otro nodo de este árbol
      - texto: Va a otro árbol
        arbol: no-enciende    # salta a otro árbol
  c1:
    tipo: conclusion
    titulo: ...
    causas: [ ... ]
    acciones: [ ... ]
```
