-- Колесо фортуни: приз у замовленні й таблиця розіграшів.
-- Лише додає: старий код сайту й CRM нових колонок не помічають.

ALTER TABLE "Order" ADD COLUMN "prize" TEXT,
ADD COLUMN "prizeDiscount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "WheelSpin" (
    "id" TEXT NOT NULL,
    "prize" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "orderNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WheelSpin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WheelSpin_createdAt_idx" ON "WheelSpin"("createdAt");
