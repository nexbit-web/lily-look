# LILY LOOK — заметки для Claude Code

Интернет-магазин женской одежды. SvelteKit 2 / Svelte 5 (runes), Tailwind v4, shadcn-svelte, Prisma 7 + Neon Postgres.

## Правила, которые легко нарушить

**Язык.** Весь текст, который видит покупатель, — украинский. Комментарии в коде — тоже украинский. README и этот файл — русский.

**Деньги — целые числа в копейках.** Никаких Float/Decimal. Форматирует только `src/lib/money.ts` (`formatPrice`). Если увидел `.toFixed(2)` или деление на 100 вне `money.ts` — это баг.

**Слои.** `routes → lib/server → prisma`. Компоненты не импортируют `$lib/server` (SvelteKit это заблокирует). Общие типы — в `src/lib/types.ts`, не в серверных модулях.

**Компоненты `src/lib/components/ui/**` — вендоренные.** Ставятся через `npx shadcn-svelte@latest add <name>`, вручную не редактируются (перезапишутся), из линта исключены.

**Цены со скидкой считает БД, а не код.** `Product.price` — базовая цена, `Product.finalPrice` (и `ProductVariant.finalPrice`) — то, что платит покупатель; их пишет триггер из правил в таблице `Discount`. Никогда не записывай `finalPrice` из приложения и не считай скидку в TS: витрина только читает `finalPrice` и сравнивает его с `price`. Ручной пересчёт — `SELECT lily_recompute_prices();`.

**Видно только то, что можно купить.** Условие «товар живой» одно на весь каталог — `VISIBLE_PRODUCT` в `catalog.ts`: `isActive` + есть вариант с `isActive` и `stock > 0`. Новый запрос к товарам — бери эту константу, не пиши условие заново. Размеры без остатка не доезжают до UI вообще (`AVAILABLE_VARIANT` в `where` вариантов).

**Prisma 7 требует driver adapter.** `new PrismaClient()` без `adapter` не работает. Клиент генерируется в `prisma/generated/` (в git не коммитится) — после правки схемы обязательно `npm run db:generate`.

**Формы работают без JS.** Все мутации — form actions, `use:enhance` только для тостов и снятия перезагрузки. Не заменяй их на `fetch`.

## Команды

```bash
npm run dev            # дев-сервер
npm test               # vitest run — два проекта: server (node) и client (jsdom)
npm run test:watch     # то же в watch-режиме
npm run check          # svelte-check — гоняй после правок типов
npm run lint           # prettier --check + eslint
npm run format         # prettier --write
npm run db:migrate     # новая миграция (dev)
npm run db:seed        # перезалить демо-каталог (сначала чистит таблицы!)
npm run db:studio      # GUI к базе
```

Проверка перед сдачей задачи: `npm test && npm run check && npm run lint`.

**Тесты — в `tests/`, не рядом с кодом.** Дерево повторяет `src/` файл в файл:
тест для `src/lib/server/catalog.ts` лежит в `tests/lib/server/catalog.test.ts`.
Имя решает, в каком прогоне тест окажется: `*.svelte.test.ts` — jsdom, всё
остальное — node. Импорты только через алиасы (`$lib/…`, `$routes/…`), Prisma
мокается через `vi.mock('$lib/server/db', …)` — в Neon тесты не ходят и `.env`
не требуют. Подробности — `tests/README.md`.

## Где что лежит

| Задача                        | Файл                         |
| ----------------------------- | ---------------------------- |
| Запросы каталога              | `src/lib/server/catalog.ts`  |
| Корзина                       | `src/lib/server/cart.ts`     |
| Оформление заказа             | `src/lib/server/orders.ts`   |
| Подключение провайдера оплаты | `src/lib/server/payments.ts` |
| Телеграм-бот менеджеров       | `src/lib/server/bot/`        |
| Правила статусов заказа       | `src/lib/bot/workflow.ts`    |
| Доставка, размеры, сортировки | `src/lib/config.ts`          |
| Валидация форм                | `src/lib/schemas.ts`         |
| Разметка Schema.org, SEO      | `src/lib/server/seo.ts`      |
| Фид Merchant, llms.txt        | `src/lib/server/feeds.ts`    |
| Условия магазина словами      | `src/lib/store-facts.ts`     |
| Схема БД                      | `prisma/schema.prisma`       |
| Тесты                         | `tests/` (зеркало `src/`)    |
| Демо-данные                   | `prisma/seed.ts`             |

## Особенности реализации

- Корзина серверная: в httpOnly-куке `lily_cart` только id. Цены всегда из БД.
- В корзину/заказ попадает `ProductVariant` (размер+цвет), а не `Product`.
- `OrderItem` хранит снимок товара — заказ не меняется задним числом.
- Списание остатков: `updateMany` с условием `stock >= quantity` внутри `$transaction`.
- Пока `DATABASE_URL` пустой, `hooks.server.ts` редиректит всё на `/setup`.
- Каталог ведёт внешняя CRM через ту же базу; сайт пишет только в `Cart`/`Order`. Контракт (что куда писать, как работают скидки и наличие) — в README, раздел «Витрина и CRM».
- `/catalog` без параметров — витрина категорий (фото из `Category.imageUrl`); списком товаров он становится только при поиске, `?sale=1` или фильтрах.
- Правило `svelte/no-navigation-without-resolve` отключено намеренно — приложение живёт в корне домена.
- **Никакого `s-maxage` на HTML-страницах.** CDN Hostinger отдаёт закешированную страницу всем, не глядя на куки, а в шапке зашит счётчик корзины. Кешируй данные в памяти (`cached()`), а `s-maxage` ставь только на ответы без личного: sitemap, фиды, `/api/category`.
- Условия магазина (доставка, оплата, возврат) формулируются только в `store-facts.ts` — их читают страницы условий и `llms.txt`. Числа при этом живут в `config.ts`.
- Фото для чужих систем (фид, `og:image`) — через `portableImageSrc` (JPEG), не `imageSrc` (`f_auto` может отдать AVIF, который Merchant Center не принимает).
