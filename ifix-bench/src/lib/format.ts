export function money(n: number | null | undefined, currency: string) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
export function dateTime(d: Date | string) {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}
export function date(d: Date | string) {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(d));
}
export const splitList = (s: string | null | undefined) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
