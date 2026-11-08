import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "./db";

export const getOrder = cache(async (id: string) => {
  const o = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      photos: { orderBy: { createdAt: "asc" } },
      checklist: true,
      diagnostics: { orderBy: { createdAt: "desc" } },
      dcReadings: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!o) notFound();
  return o;
});
