import Link from "next/link";
export default function NotFound() {
  return (
    <div className="panel space-y-4 text-center">
      <h1 className="h1">No encontrado</h1>
      <Link href="/" className="btn-primary">Volver al inicio</Link>
    </div>
  );
}
