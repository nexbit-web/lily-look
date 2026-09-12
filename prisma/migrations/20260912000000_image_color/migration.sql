-- Фото прив'язується до кольору варіанта. Колонка nullable: усі наявні
-- фото лишаються спільними для всіх кольорів, поки CRM не проставить колір.
ALTER TABLE "ProductImage" ADD COLUMN "color" TEXT;

-- Галерея завжди читає фото одного товару в порядку position,
-- з фільтром за кольором.
CREATE INDEX "ProductImage_productId_color_position_idx" ON "ProductImage"("productId", "color", "position");
