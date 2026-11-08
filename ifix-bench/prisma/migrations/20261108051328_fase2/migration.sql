-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT,
    "modelo" TEXT NOT NULL,
    "linea" TEXT NOT NULL,
    "modo" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "unidad" TEXT NOT NULL,
    "placaBuena" BOOLEAN NOT NULL DEFAULT false,
    "nota" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Measurement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShortHunt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT,
    "linea" TEXT NOT NULL,
    "resistencia" REAL,
    "voltajeInyectado" REAL,
    "corrienteMax" REAL,
    "metodo" TEXT NOT NULL DEFAULT '',
    "componenteHallado" TEXT,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "pasosHechos" TEXT NOT NULL DEFAULT '[]',
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShortHunt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "sku" TEXT,
    "categoria" TEXT NOT NULL,
    "modelos" TEXT NOT NULL DEFAULT '',
    "calidad" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stockMinimo" INTEGER NOT NULL DEFAULT 0,
    "costo" REAL,
    "precioVenta" REAL,
    "proveedor" TEXT,
    "ubicacion" TEXT,
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PartUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "costoUnit" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartUsage_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuideProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "guiaId" TEXT NOT NULL,
    "pasosHechos" TEXT NOT NULL DEFAULT '[]',
    "checks" TEXT NOT NULL DEFAULT '{}',
    "segundos" INTEGER NOT NULL DEFAULT 0,
    "terminada" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GuideProgress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "modelos" TEXT NOT NULL DEFAULT '',
    "archivo" TEXT,
    "rutaLocal" TEXT,
    "tamano" INTEGER,
    "nota" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Measurement_modelo_linea_modo_idx" ON "Measurement"("modelo", "linea", "modo");

-- CreateIndex
CREATE UNIQUE INDEX "GuideProgress_orderId_guiaId_key" ON "GuideProgress"("orderId", "guiaId");
