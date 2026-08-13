-- Знижки як правила в БД + підсумкова ціна, яку рахує сама база.
--
-- Магазин працює разом із зовнішньою CRM: вона пише товари, категорії,
-- залишки й правила знижок. Щоб ціна не залежала від того, хто саме пише
-- в базу, підсумкову ціну (Product."finalPrice" / ProductVariant."finalPrice")
-- рахують тригери, а не застосунок.

-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('ALL', 'CATEGORY', 'PRODUCT');

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "compareAt",
ADD COLUMN     "finalPrice" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "finalPrice" INTEGER,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "DiscountScope" NOT NULL,
    "percent" INTEGER,
    "amount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCategory" (
    "discountId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "DiscountCategory_pkey" PRIMARY KEY ("discountId","categoryId")
);

-- CreateTable
CREATE TABLE "DiscountProduct" (
    "discountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "DiscountProduct_pkey" PRIMARY KEY ("discountId","productId")
);

-- CreateIndex
CREATE INDEX "Discount_isActive_idx" ON "Discount"("isActive");

-- CreateIndex
CREATE INDEX "DiscountCategory_categoryId_idx" ON "DiscountCategory"("categoryId");

-- CreateIndex
CREATE INDEX "DiscountProduct_productId_idx" ON "DiscountProduct"("productId");

-- CreateIndex
CREATE INDEX "Product_isActive_finalPrice_idx" ON "Product"("isActive", "finalPrice");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_isActive_stock_idx" ON "ProductVariant"("productId", "isActive", "stock");

-- AddForeignKey
ALTER TABLE "DiscountCategory" ADD CONSTRAINT "DiscountCategory_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCategory" ADD CONSTRAINT "DiscountCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Правила знижки: або відсоток, або сума ─────────────────────────────────
-- Захист від напівзаповненого правила, яке CRM могла б створити помилково.
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_value_check" CHECK (
  ("percent" IS NOT NULL AND "amount" IS NULL AND "percent" BETWEEN 1 AND 90)
  OR ("percent" IS NULL AND "amount" IS NOT NULL AND "amount" > 0)
);

-- ─── Розрахунок ціни ────────────────────────────────────────────────────────
-- Найкраща (найнижча) ціна серед усіх увімкнених правил, що дістають товар.
-- Знижки не додаються одна до одної — виграє одна, найвигідніша покупцеві.
CREATE OR REPLACE FUNCTION lily_final_price(
  base integer,
  p_product_id text,
  p_category_id text
) RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    MIN(
      GREATEST(
        0,
        CASE
          WHEN d."percent" IS NOT NULL THEN base - ROUND(base * d."percent" / 100.0)::int
          ELSE base - d."amount"
        END
      )
    ),
    base
  )
  FROM "Discount" d
  WHERE d."isActive"
    AND (
      d."scope" = 'ALL'
      OR (
        d."scope" = 'CATEGORY'
        AND EXISTS (
          SELECT 1 FROM "DiscountCategory" dc
          WHERE dc."discountId" = d."id" AND dc."categoryId" = p_category_id
        )
      )
      OR (
        d."scope" = 'PRODUCT'
        AND EXISTS (
          SELECT 1 FROM "DiscountProduct" dp
          WHERE dp."discountId" = d."id" AND dp."productId" = p_product_id
        )
      )
    );
$$;

-- Перерахунок усього каталогу. Викликається тригерами при зміні правил;
-- CRM теж може смикнути вручну: SELECT lily_recompute_prices();
CREATE OR REPLACE FUNCTION lily_recompute_prices() RETURNS void
LANGUAGE sql
AS $$
  UPDATE "Product" p
     SET "finalPrice" = lily_final_price(p."price", p."id", p."categoryId")
   WHERE p."finalPrice" IS DISTINCT FROM lily_final_price(p."price", p."id", p."categoryId");

  UPDATE "ProductVariant" v
     SET "finalPrice" = lily_final_price(v."price", v."productId", p."categoryId")
    FROM "Product" p
   WHERE p."id" = v."productId"
     AND v."price" IS NOT NULL
     AND v."finalPrice" IS DISTINCT FROM lily_final_price(v."price", v."productId", p."categoryId");

  UPDATE "ProductVariant" v
     SET "finalPrice" = NULL
   WHERE v."price" IS NULL AND v."finalPrice" IS NOT NULL;
$$;

-- ─── Тригери ────────────────────────────────────────────────────────────────
-- Товар: ціна перераховується щоразу, коли міняється база або категорія.
-- Тригер навішаний тільки на "price"/"categoryId", тож UPDATE самого
-- "finalPrice" (з lily_recompute_prices) не викликає рекурсії.
CREATE OR REPLACE FUNCTION lily_product_price_sync() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."finalPrice" := lily_final_price(NEW."price", NEW."id", NEW."categoryId");
  RETURN NEW;
END;
$$;

CREATE TRIGGER "product_price_sync"
BEFORE INSERT OR UPDATE OF "price", "categoryId" ON "Product"
FOR EACH ROW EXECUTE FUNCTION lily_product_price_sync();

-- Варіант: власна ціна теж отримує знижку товару.
CREATE OR REPLACE FUNCTION lily_variant_price_sync() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_category_id text;
BEGIN
  IF NEW."price" IS NULL THEN
    NEW."finalPrice" := NULL;
  ELSE
    SELECT p."categoryId" INTO v_category_id FROM "Product" p WHERE p."id" = NEW."productId";
    NEW."finalPrice" := lily_final_price(NEW."price", NEW."productId", v_category_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "variant_price_sync"
BEFORE INSERT OR UPDATE OF "price", "productId" ON "ProductVariant"
FOR EACH ROW EXECUTE FUNCTION lily_variant_price_sync();

-- Правила знижок: один перерахунок на весь запит, а не на кожен рядок,
-- інакше масове призначення знижки в CRM переписувало б каталог сотні разів.
CREATE OR REPLACE FUNCTION lily_discount_changed() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM lily_recompute_prices();
  RETURN NULL;
END;
$$;

CREATE TRIGGER "discount_price_sync"
AFTER INSERT OR UPDATE OR DELETE ON "Discount"
FOR EACH STATEMENT EXECUTE FUNCTION lily_discount_changed();

CREATE TRIGGER "discount_category_price_sync"
AFTER INSERT OR UPDATE OR DELETE ON "DiscountCategory"
FOR EACH STATEMENT EXECUTE FUNCTION lily_discount_changed();

CREATE TRIGGER "discount_product_price_sync"
AFTER INSERT OR UPDATE OR DELETE ON "DiscountProduct"
FOR EACH STATEMENT EXECUTE FUNCTION lily_discount_changed();

-- ─── Перший розрахунок для вже наявних даних ────────────────────────────────
UPDATE "Product" SET "finalPrice" = "price";
UPDATE "ProductVariant" SET "finalPrice" = "price";
SELECT lily_recompute_prices();
