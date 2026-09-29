/**
 * Зелена кнопка покупки — одна на сторінку товару й вікно швидкого
 * замовлення, щоб «купити» всюди виглядало однаково.
 *
 * Заливка кнопки — фонова картинка з background-position: center.
 * На наведення її ширина йде в нуль, тож колір стискається з обох
 * боків до середини, лишаючи рамку й текст того ж кольору.
 * `enabled:` — щоб вимкнена кнопка не «роздягалась» під курсором.
 */
export const BUY_BUTTON =
	'rounded-full border-2 border-[#53af01] bg-transparent bg-[linear-gradient(#53af01,#53af01)] bg-[length:100%_100%] bg-center bg-no-repeat duration-500 hover:bg-transparent enabled:hover:bg-[length:0%_100%] enabled:hover:text-[#53af01]';

/** Друга дія поруч із зеленою: та сама форма, але контуром — щоб не сперечались. */
export const SECONDARY_BUTTON =
	'rounded-full border-2 border-foreground/80 bg-transparent text-foreground transition-colors hover:bg-foreground hover:text-background';

/**
 * «Купити» під карткою товару. Це не `<button>`, а частина посилання:
 * уся картка веде на товар, і кнопка всередині посилання була б
 * недопустимою розміткою. Тому реагує вона на наведення на всю картку
 * (`group-hover`): чорна заливка змінюється контуром.
 *
 * Чорна, а не зелена: у сітці з десятків карток зелені кнопки кричали б
 * громіше за самі речі. Зелена лишається одна — на сторінці товару.
 */
export const CARD_BUY =
	'rounded-md border-2 border-foreground bg-foreground text-background transition-colors duration-300 group-hover:bg-transparent group-hover:text-foreground motion-reduce:transition-none';

/** Те саме місце для розпроданої речі: подивитись можна, купити — ні. */
export const CARD_VIEW =
	'rounded-md border-2 border-foreground/20 text-muted-foreground transition-colors group-hover:border-foreground/60 group-hover:text-foreground';
