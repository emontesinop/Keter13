-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "imei" TEXT,
    "serie" TEXT,
    "codigoDesbloqueo" TEXT,
    "fallaReportada" TEXT NOT NULL,
    "sintomas" TEXT NOT NULL DEFAULT '',
    "estadoFisico" TEXT NOT NULL DEFAULT '',
    "estadoFisicoNota" TEXT,
    "presupuesto" REAL,
    "costoFinal" REAL,
    "estado" TEXT NOT NULL DEFAULT 'RECIBIDO',
    "icloudBloqueado" BOOLEAN NOT NULL DEFAULT false,
    "pruebaPropiedad" TEXT,
    "pruebaVerificada" BOOLEAN NOT NULL DEFAULT false,
    "garantiaDias" INTEGER,
    "boardviewPath" TEXT,
    "diagnosticoFinal" TEXT,
    "causaRaiz" TEXT,
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deliveredAt" DATETIME,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "nota" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Photo_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fase" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "nota" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChecklistResult_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosticSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT,
    "arbol" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "conclusion" TEXT,
    "resumen" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiagnosticSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DcReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT,
    "patron" TEXT NOT NULL,
    "voltaje" REAL,
    "mA" REAL,
    "momento" TEXT,
    "nota" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DcReading_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Customer_telefono_idx" ON "Customer"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "Order_codigo_key" ON "Order"("codigo");

-- CreateIndex
CREATE INDEX "Order_modelo_idx" ON "Order"("modelo");

-- CreateIndex
CREATE INDEX "Order_estado_idx" ON "Order"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistResult_orderId_fase_itemKey_key" ON "ChecklistResult"("orderId", "fase", "itemKey");
