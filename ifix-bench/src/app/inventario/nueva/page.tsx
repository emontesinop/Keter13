import { createPart } from "@/app/actions";
import { PartForm } from "@/components/PartForm";
import { getModels } from "@/lib/knowledge";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function NewPart() {
  const s = await getSettings();
  return (
    <div className="space-y-6">
      <h1 className="h1">Nueva pieza</h1>
      <PartForm action={createPart} models={getModels()} currency={s.moneda} isNew />
    </div>
  );
}
