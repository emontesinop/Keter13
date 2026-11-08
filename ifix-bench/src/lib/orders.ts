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
      measurements: { orderBy: { createdAt: "desc" } },
      shortHunts: { orderBy: { updatedAt: "desc" } },
      partUsages: { include: { part: true }, orderBy: { createdAt: "desc" } },
      guideProgress: true,
    },
  });
  if (!o) notFound();
  return o;
});
