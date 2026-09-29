-- Відсоток знижки з дробовою частиною: 33.6 %, а не лише цілі 33 %.
--
-- Наявні значення (20, 15, 33…) переносяться без втрат. Перевірка
-- "Discount_value_check" (відсоток 1..90 або сума > 0) працює й з numeric,
-- а lily_final_price уже рахує ROUND(base * percent / 100.0)::int — з
-- дробовим відсотком це правильно. "amount" лишається цілим (копійки).

-- AlterTable
ALTER TABLE "Discount"
  ALTER COLUMN "percent" TYPE numeric(5,2) USING "percent"::numeric(5,2);
