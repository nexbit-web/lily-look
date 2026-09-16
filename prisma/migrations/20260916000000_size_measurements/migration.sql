-- Заміри розмірів. Таблицю завела CRM прямо в базі, тож ця міграція лише
-- записує її в історію — щоб чиста база (новий клон, тестове середовище)
-- отримала таку саму. Через це кожен крок ідемпотентний: там, де таблиця
-- вже є, міграція нічого не робить і не падає.
CREATE TABLE IF NOT EXISTS "ProductMeasurement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "ua" TEXT,
    "chest" INTEGER,
    "sleeve" INTEGER,
    "length" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductMeasurement_pkey" PRIMARY KEY ("id")
);

-- Один рядок замірів на розмір товару.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductMeasurement_productId_size_key" ON "ProductMeasurement"("productId", "size");
CREATE INDEX IF NOT EXISTS "ProductMeasurement_productId_position_idx" ON "ProductMeasurement"("productId", "position");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ProductMeasurement_productId_fkey'
    ) THEN
        ALTER TABLE "ProductMeasurement"
            ADD CONSTRAINT "ProductMeasurement_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
