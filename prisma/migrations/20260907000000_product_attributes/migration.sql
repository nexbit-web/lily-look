-- Характеристики товару: довільні пари «назва — значення», які веде CRM.
-- Таблиця тільки додається, наявні дані не чіпаються.
CREATE TABLE "ProductAttribute" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

-- Одна характеристика на товар: дублікат «Складу» — це помилка імпорту.
CREATE UNIQUE INDEX "ProductAttribute_productId_name_key" ON "ProductAttribute"("productId", "name");

-- Список читається завжди цілком і завжди в порядку position.
CREATE INDEX "ProductAttribute_productId_position_idx" ON "ProductAttribute"("productId", "position");

ALTER TABLE "ProductAttribute"
    ADD CONSTRAINT "ProductAttribute_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
