-- Статистика колеса фортуни для CRM.
--
-- Лише читання: дві вистави над тим, що сайт і так пише, — події
-- відвідувачів (`PageEvent`: `wheel_shown`, `wheel_spin`, `order`),
-- розіграші (`WheelSpin`) і замовлення (`Order`). Нових даних немає, CRM
-- читає вистави як звичайні таблиці.
--
-- Колонки `createdAt` — `timestamp` без поясу, у них UTC; день рахуємо
-- за Києвом. Гроші — у копійках, як скрізь у базі.

-- Колесо по днях: скільки людей побачили, покрутили, що виграли, скільки
-- замовлень пішло з призом і на яку суму.
CREATE VIEW "WheelDailyStats" AS
WITH launch AS (
    SELECT least(
        (SELECT min("createdAt") FROM "PageEvent" WHERE "type" IN ('wheel_shown', 'wheel_spin')),
        (SELECT min("createdAt") FROM "WheelSpin")
    ) AS "at"
),
visitors AS (
    SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv')::date AS "day",
           count(DISTINCT "visitorId") FILTER (
               WHERE "type" = 'wheel_shown' OR ("type" = 'view' AND "path" = '/wheel')
           ) AS "shown",
           count(DISTINCT "visitorId") FILTER (WHERE "type" = 'wheel_spin') AS "spun"
    FROM "PageEvent"
    WHERE "type" IN ('wheel_shown', 'wheel_spin') OR ("type" = 'view' AND "path" = '/wheel')
    GROUP BY 1
),
spins AS (
    SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv')::date AS "day",
           count(*) AS "won",
           count(*) FILTER (WHERE "prize" = 'delivery') AS "wonDelivery",
           count(*) FILTER (WHERE "prize" <> 'delivery') AS "wonDiscount",
           count(*) FILTER (WHERE "usedAt" IS NOT NULL) AS "used"
    FROM "WheelSpin"
    GROUP BY 1
),
orders AS (
    SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv')::date AS "day",
           count(*) AS "orders",
           count(*) FILTER (WHERE "prize" IS NOT NULL) AS "prizeOrders",
           coalesce(sum("total") FILTER (WHERE "prize" IS NOT NULL), 0) AS "prizeRevenue",
           coalesce(sum("prizeDiscount"), 0) AS "prizeDiscount"
    FROM "Order", launch
    WHERE "status" <> 'CANCELLED' AND "createdAt" >= launch."at"
    GROUP BY 1
)
SELECT "day",
       coalesce(visitors."shown", 0) AS "shown",
       coalesce(visitors."spun", 0) AS "spun",
       coalesce(spins."won", 0) AS "won",
       coalesce(spins."wonDiscount", 0) AS "wonDiscount",
       coalesce(spins."wonDelivery", 0) AS "wonDelivery",
       coalesce(spins."used", 0) AS "used",
       coalesce(orders."orders", 0) AS "orders",
       coalesce(orders."prizeOrders", 0) AS "prizeOrders",
       coalesce(orders."prizeRevenue", 0) AS "prizeRevenue",
       coalesce(orders."prizeDiscount", 0) AS "prizeDiscount"
FROM visitors
FULL JOIN spins USING ("day")
FULL JOIN orders USING ("day");

-- Чи допомагає колесо продавати: частка тих, хто замовив, серед тих, хто
-- крутив, хто бачив і не крутив, і хто колеса не бачив. Усе — з дня запуску
-- колеса, люди — за міткою браузера `visitorId`.
CREATE VIEW "WheelEffect" AS
WITH launch AS (
    SELECT least(
        (SELECT min("createdAt") FROM "PageEvent" WHERE "type" IN ('wheel_shown', 'wheel_spin')),
        (SELECT min("createdAt") FROM "WheelSpin")
    ) AS "at"
),
people AS (
    SELECT "visitorId",
           bool_or("type" = 'wheel_spin') AS "spun",
           bool_or("type" = 'wheel_shown' OR ("type" = 'view' AND "path" = '/wheel')) AS "shown",
           bool_or("type" = 'add_to_cart') AS "added",
           bool_or("type" = 'order') AS "ordered"
    FROM "PageEvent", launch
    WHERE "createdAt" >= launch."at"
    GROUP BY "visitorId"
)
SELECT CASE
           WHEN "spun" THEN 'spun'
           WHEN "shown" THEN 'shown_not_spun'
           ELSE 'not_shown'
       END AS "group",
       count(*) AS "visitors",
       count(*) FILTER (WHERE "added") AS "addedToCart",
       count(*) FILTER (WHERE "ordered") AS "ordered",
       round(100.0 * count(*) FILTER (WHERE "ordered") / nullif(count(*), 0), 2) AS "conversionPercent"
FROM people
GROUP BY 1;
