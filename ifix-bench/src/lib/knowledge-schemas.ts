import { z } from "zod";

export const estadoArchivo = z.enum(["verificar", "verificado"]).default("verificar");

export const ModelSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  anio: z.number(),
  conector: z.enum(["Lightning", "USB-C"]),
  biometria: z.enum(["face_id", "touch_id"]),
  pantalla: z.enum(["LCD", "OLED"]),
  familia: z.string(),
});
export const ModelsFile = z.object({ estado: estadoArchivo, modelos: z.array(ModelSchema).min(1) });

export const ChecklistItem = z.object({
  key: z.string(),
  label: z.string(),
  ayuda: z.string().optional(),
  solo_biometria: z.enum(["face_id", "touch_id"]).optional(),
});
export const ChecklistFile = z.object({
  estado: estadoArchivo,
  grupos: z.array(z.object({ id: z.string(), titulo: z.string(), items: z.array(ChecklistItem) })),
});

export const PhysicalFile = z.object({
  estado: estadoArchivo,
  opciones: z.array(z.object({ key: z.string(), label: z.string(), aviso: z.string().optional() })),
});

export const SymptomsFile = z.object({
  estado: estadoArchivo,
  sintomas: z.array(z.object({ key: z.string(), label: z.string(), arbol: z.string().optional() })),
});

export const SafetyFile = z.object({
  estado: estadoArchivo,
  avisos: z.record(
    z.object({
      nivel: z.enum(["peligro", "precaucion", "info"]),
      titulo: z.string(),
      texto: z.string(),
      campos_usuario: z.array(z.string()).optional(),
    }),
  ),
});

export const Destino = z.object({
  arbol: z.string().optional(),
  nodo: z.string().optional(),
  modulo: z.string().optional(),
});

export const DcFile = z.object({
  estado: estadoArchivo,
  como_conectar: z.string(),
  campos_usuario: z.array(z.string()).optional(),
  patrones: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      descripcion: z.string(),
      causas: z.array(z.string()),
      siguiente: Destino.optional(),
      verificado: z.boolean().default(false),
    }),
  ),
});

export const Herramienta = z.enum([
  "multimetro",
  "fuente_dc",
  "camara_termica",
  "microscopio",
  "medidor_usb",
  "visual",
  "pc",
  "ninguna",
]);

export const Opcion = z.object({
  texto: z.string(),
  siguiente: z.string().optional(),
  arbol: z.string().optional(),
});

export const Nodo = z.object({
  tipo: z.enum(["pregunta", "medicion", "conclusion"]),
  titulo: z.string(),
  instruccion: z.string().optional(),
  herramienta: Herramienta.optional(),
  medir: z.string().optional(),
  valor_esperado: z.string().nullable().optional(),
  seguridad: z.array(z.string()).optional(),
  abrir_consumo: z.boolean().optional(),
  verificado: z.boolean().default(false),
  opciones: z.array(Opcion).optional(),
  causas: z.array(z.string()).optional(),
  acciones: z.array(z.string()).optional(),
  ir_a: Destino.optional(),
});

export const TreeFile = z.object({
  id: z.string(),
  titulo: z.string(),
  descripcion: z.string().optional(),
  estado: estadoArchivo,
  inicio: z.string(),
  nodos: z.record(Nodo),
});

export type Model = z.infer<typeof ModelSchema>;
export type Checklist = z.infer<typeof ChecklistFile>;
export type Safety = z.infer<typeof SafetyFile>;
export type DcPatterns = z.infer<typeof DcFile>;
export type Tree = z.infer<typeof TreeFile>;
export type TreeNode = z.infer<typeof Nodo>;
