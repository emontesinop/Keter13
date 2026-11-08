import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { CHECK_RESULTS } from "@/lib/constants";
import { checklistFor } from "@/lib/checklist";
import { compareChecklists } from "@/lib/compare";
import { getModel } from "@/lib/knowledge";
import { UPLOAD_DIR } from "@/lib/paths";
import { getSettings } from "@/lib/settings";
import { date, money } from "@/lib/format";

export const dynamic = "force-dynamic";

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9.5, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#111", paddingBottom: 8, marginBottom: 10 },
  shop: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  h: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4, textTransform: "uppercase", color: "#333" },
  row: { flexDirection: "row" },
  col: { flex: 1 },
  k: { color: "#555" },
  box: { borderWidth: 1, borderColor: "#bbb", padding: 6, borderRadius: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 2 },
  th: { fontFamily: "Helvetica-Bold" },
  total: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 6 },
  photos: { flexDirection: "row", gap: 6, marginTop: 4 },
  photo: { width: 120, height: 120, objectFit: "cover", borderRadius: 3 },
  sign: { flex: 1, borderTopWidth: 1, borderTopColor: "#111", marginTop: 36, paddingTop: 4, textAlign: "center", marginHorizontal: 16 },
  small: { fontSize: 8, color: "#444" },
});

const lbl = (r?: string) => (r ? CHECK_RESULTS.find((c) => c.id === r)?.label ?? r : "-");

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const o = await db.order.findUnique({
    where: { id },
    include: { customer: true, checklist: true, photos: true, partUsages: { include: { part: true } } },
  });
  if (!o) return new Response("No encontrado", { status: 404 });
  const st = await getSettings();
  let modelName = o.modelo;
  let items: { key: string; label: string }[] = [];
  try {
    modelName = getModel(o.modelo)?.nombre ?? o.modelo;
    items = checklistFor(o.modelo).flatMap((g) => g.items);
  } catch {}
  const cmp = compareChecklists(
    items,
    o.checklist.filter((c) => c.fase === "ENTRADA"),
    o.checklist.filter((c) => c.fase === "SALIDA"),
  );
  const rows = cmp.all.filter((r) => r.entrada || r.salida);
  const entrega = o.deliveredAt ?? new Date();
  const dias = o.garantiaDias ?? Number(st.garantia_dias || 0);
  const vence = new Date(entrega.getTime() + dias * 86400000);
  const total = o.costoFinal ?? o.presupuesto;

  const photos: { data: Buffer; format: "jpg" | "png" }[] = [];
  for (const p of o.photos.filter((p) => p.etapa === "SALIDA").slice(0, 4)) {
    const ext = extname(p.ruta).toLowerCase();
    if (![".jpg", ".jpeg", ".png"].includes(ext)) continue;
    try {
      photos.push({ data: await readFile(join(UPLOAD_DIR, p.ruta)), format: ext === ".png" ? "png" : "jpg" });
    } catch {}
  }

  const doc = (
    <Document title={`Nota de entrega ${o.codigo}`} author={st.nombre_taller}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.shop}>{st.nombre_taller}</Text>
            {st.direccion_taller ? <Text>{st.direccion_taller}</Text> : null}
            {st.telefono_taller ? <Text>Tel. {st.telefono_taller}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>NOTA DE ENTREGA</Text>
            <Text style={{ textAlign: "right" }}>Orden {o.codigo}</Text>
            <Text style={{ textAlign: "right" }}>Fecha: {date(entrega)}</Text>
          </View>
        </View>

        <View style={s.row}>
          <View style={[s.col, s.box, { marginRight: 6 }]}>
            <Text style={s.th}>Cliente</Text>
            <Text>{o.customer.nombre}</Text>
            {o.customer.telefono ? <Text>Tel. {o.customer.telefono}</Text> : null}
            <Text style={s.k}>Recibe: {o.recibidoPor ?? o.customer.nombre}</Text>
          </View>
          <View style={[s.col, s.box]}>
            <Text style={s.th}>Equipo</Text>
            <Text>{modelName}</Text>
            {o.imei ? <Text>IMEI: {o.imei}</Text> : null}
            {o.serie ? <Text>Serie: {o.serie}</Text> : null}
            <Text style={s.k}>Recibido: {date(o.createdAt)}</Text>
          </View>
        </View>

        <Text style={s.h}>Falla reportada</Text>
        <Text>{o.fallaReportada}</Text>
        <Text style={s.h}>Trabajo realizado</Text>
        <Text>{o.diagnosticoFinal || "-"}</Text>

        {o.partUsages.length > 0 && (
          <>
            <Text style={s.h}>Piezas instaladas</Text>
            {o.partUsages.map((u) => (
              <Text key={u.id}>
                {u.cantidad} x {u.part.nombre}
                {u.part.calidad ? ` (${u.part.calidad})` : ""}
              </Text>
            ))}
          </>
        )}
        <Text style={s.total}>Total: {money(total, st.moneda)}</Text>

        {rows.length > 0 && (
          <>
            <Text style={s.h}>Pruebas de funcionamiento (entrada / salida)</Text>
            <View style={[s.tr, s.th]}>
              <Text style={{ flex: 3 }}>Función</Text>
              <Text style={{ flex: 1 }}>Entrada</Text>
              <Text style={{ flex: 1 }}>Salida</Text>
            </View>
            {rows.map((r) => (
              <View key={r.key} style={s.tr} wrap={false}>
                <Text style={{ flex: 3 }}>{r.label}</Text>
                <Text style={{ flex: 1 }}>{lbl(r.entrada)}</Text>
                <Text style={{ flex: 1, fontFamily: r.entrada !== r.salida ? "Helvetica-Bold" : "Helvetica" }}>{lbl(r.salida)}</Text>
              </View>
            ))}
          </>
        )}

        {o.notaEntrega ? (
          <>
            <Text style={s.h}>Observaciones</Text>
            <Text>{o.notaEntrega}</Text>
          </>
        ) : null}

        {photos.length > 0 && (
          <View wrap={false}>
            <Text style={s.h}>Fotos de salida</Text>
            <View style={s.photos}>
              {photos.map((p, i) => (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image key={i} style={s.photo} src={{ data: p.data, format: p.format }} />
              ))}
            </View>
          </View>
        )}

        <View wrap={false}>
          <Text style={s.h}>Garantía</Text>
          <View style={s.box}>
            <Text style={s.th}>
              {dias > 0 ? `${dias} días - válida hasta el ${date(vence)}` : "Sin garantía"}
            </Text>
            <Text style={s.small}>{st.condiciones_garantia}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.sign}>Firma del cliente</Text>
            <Text style={s.sign}>Firma del técnico</Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  const buf = await renderToBuffer(doc);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="nota-entrega-${o.codigo}.pdf"`, "Cache-Control": "no-store" },
  });
}
