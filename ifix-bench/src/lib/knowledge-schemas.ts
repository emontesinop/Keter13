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
}).strict();
export const ModelsFile = z.object({ estado: estadoArchivo, modelos: z.array(ModelSchema).min(1) });

export const ChecklistItem = z.object({
  key: z.string(),
  label: z.string(),
  ayuda: z.string().optional(),
  solo_biometria: z.enum(["face_id", "touch_id"]).optional(),
}).strict();
export const ChecklistFile = z.object({
  estado: estadoArchivo,
  grupos: z.array(z.object({ id: z.string(), titulo: z.string(), items: z.array(ChecklistItem) })),
});

export const PhysicalFile = z.object({
  estado: estadoArchivo,
  opciones: z.array(z.object({ key: z.string(), label: z.string(), aviso: z.string().optional() }).strict()),
});

export const SymptomsFile = z.object({
  estado: estadoArchivo,
  sintomas: z.array(z.object({ key: z.string(), label: z.string(), arbol: z.string().optional() }).strict()),
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
  nodo: z.string().optional(), // nodo dentro del otro árbol (con "arbol")
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

const optNum = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => (v === "" || v == null ? null : typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : null));

export const ReferenceLinesFile = z.object({
  estado: estadoArchivo,
  lineas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      grupo: z.string().default("Otras"),
      descripcion: z.string().optional(),
      donde_medir: z.string().optional(),
      voltaje_nominal: optNum,
      inyeccion_max_v: optNum,
      inyeccion_max_a: optNum,
      alias: z.record(z.string()).nullable().optional(),
    }),
  ),
});

export const ShortFlowFile = z.object({
  estado: estadoArchivo,
  metodos: z.array(z.object({ id: z.string(), label: z.string() })),
  pasos: z.array(
    z.object({
      id: z.string(),
      titulo: z.string(),
      herramienta: Herramienta.optional(),
      texto: z.string(),
      seguridad: z.array(z.string()).optional(),
      metodo: z.string().optional(),
      registra_medicion: z.boolean().optional(),
      pide_inyeccion: z.boolean().optional(),
      verificado: z.boolean().default(false),
    }),
  ),
});

export const Tornillo = z.object({
  tipo: z.string(),
  ubicacion: z.string(),
  cantidad: z.number().nullable().optional(),
  largo: z.string().nullable().optional(),
}).strict();

export const GuideFile = z.object({
  id: z.string(),
  titulo: z.string(),
  tipo: z.enum(["modular", "placa"]).default("modular"),
  categoria_pieza: z.string().optional(),
  modelos: z.array(z.string()).min(1),
  estado: estadoArchivo,
  tiempo_estimado_min: z.number().optional(),
  dificultad: z.string().optional(),
  herramientas: z.array(z.string()).default([]),
  seguridad: z.array(z.string()).default([]),
  notas: z.string().optional(),
  pasos: z
    .array(
      z.object({
        titulo: z.string(),
        texto: z.string(),
        tornillos: z.array(Tornillo).optional(),
        advertencias: z.array(z.string()).optional(),
        seguridad: z.array(z.string()).optional(),
        temperatura: z.string().optional(),
        checks: z.array(z.string()).optional(),
        tiempo_min: z.number().optional(),
        imagen: z.string().optional(),
        verificado: z.boolean().default(false),
      }),
    )
    .min(1),
});

export type ReferenceLine = z.infer<typeof ReferenceLinesFile>["lineas"][number];
export type ShortFlow = z.infer<typeof ShortFlowFile>;
export type Guide = z.infer<typeof GuideFile>;
export const ProgrammingFile = z.object({
  estado: estadoArchivo,
  aviso_legal: z.string(),
  herramientas: z.array(z.object({ id: z.string(), label: z.string() })),
  piezas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      familias: z.array(z.string()).default([]),
      modelos: z.array(z.string()).default([]),
      requiere: z.string(),
      mensaje: z.string(),
      pasos: z.array(z.string()),
      herramientas: z.array(z.string()).default([]),
      notas: z.string().optional(),
      verificado: z.boolean().default(false),
    }),
  ),
});
export type Programming = z.infer<typeof ProgrammingFile>;

export type Model = z.infer<typeof ModelSchema>;
export type Checklist = z.infer<typeof ChecklistFile>;
export type Safety = z.infer<typeof SafetyFile>;
export type DcPatterns = z.infer<typeof DcFile>;
export type Tree = z.infer<typeof TreeFile>;
export type TreeNode = z.infer<typeof Nodo>;
