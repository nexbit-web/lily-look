-- Приз колеса «Безкоштовна доставка»: перевізнику за це замовлення платить магазин.
ALTER TABLE "Order" ADD COLUMN "prizeFreeDelivery" BOOLEAN NOT NULL DEFAULT false;
