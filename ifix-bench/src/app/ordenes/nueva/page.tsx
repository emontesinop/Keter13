import { createOrder } from "@/app/actions";
import { OrderFields } from "@/components/OrderFields";
import { SubmitButton } from "@/components/SubmitButton";
import { KnowledgeErrorBox, SafetyBanner } from "@/components/ui";
import { getModels, getPhysical, getSafety, getSymptoms } from "@/lib/knowledge";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function NewOrder() {
  let k;
  try {
    k = { models: getModels(), symptoms: getSymptoms(), physical: getPhysical(), safety: getSafety() };
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const settings = await getSettings();
  return (
    <form action={createOrder} className="space-y-6">
      <h1 className="h1">Recibir equipo</h1>

      <OrderFields {...k} currency={settings.moneda} />

      <fieldset className="panel space-y-3">
        <legend className="h3 px-2">Bloqueo de activación</legend>
        <label className="flex min-h-touch cursor-pointer items-center gap-4 rounded-xl border-2 border-red-500/60 bg-red-950/30 px-4 py-3 has-[:checked]:border-red-500 has-[:checked]:bg-red-950/70">
          <input type="checkbox" name="icloudBloqueado" className="h-8 w-8 accent-red-500" />
          <span className="text-lg font-bold">El equipo tiene bloqueo de iCloud / Buscar activado y el cliente no puede quitarlo</span>
        </label>
        <p className="text-sm text-bench-muted">
          La orden quedará marcada y no se podrá pasar a reparación ni entregar hasta registrar y verificar la prueba de propiedad
          (factura, caja con IMEI, etc.). iFix Bench no incluye ningún método para saltar bloqueos de activación, de operador ni de cuenta.
        </p>
      </fieldset>

      <fieldset className="panel space-y-3">
        <legend className="h3 px-2">Fotos de entrada</legend>
        <input type="file" name="fotos" accept="image/*" capture="environment" multiple className="input py-3 file:mr-4 file:rounded-lg file:border-0 file:bg-bench-accent file:px-4 file:py-2 file:font-semibold file:text-black" />
        <p className="text-sm text-bench-muted">Frente, reverso, laterales y cualquier daño. Puedes añadir más después.</p>
      </fieldset>

      {k.safety.esd && <SafetyBanner aviso={k.safety.esd} />}

      <div className="sticky bottom-24 z-30 md:bottom-4">
        <SubmitButton className="btn-primary btn-xl w-full shadow-2xl">Crear orden y pasar al checklist</SubmitButton>
      </div>
    </form>
  );
}
