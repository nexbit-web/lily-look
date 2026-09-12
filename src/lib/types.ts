/**
 * View-моделі — контракт між сервером і UI.
 *
 * Компоненти залежать тільки від цих типів, а не від Prisma. Завдяки цьому
 * схему БД можна змінювати, не переписуючи інтерфейс, а компоненти
 * не імпортують нічого з `$lib/server`.
 */

export type CategoryLink = {
	slug: string;
	name: string;
	productCount: number;
};

/** Категорія на вітрині /catalog: фото, назва, скільки всередині. */
export type CategoryCard = {
	slug: string;
	name: string;
	productCount: number;
	imageUrl: string | null;
};

export type ProductCard = {
	id: string;
	slug: string;
	name: string;
	/** Копійки. */
	price: number;
	compareAt: number | null;
	image: { url: string; alt: string } | null;
	/** Друге фото — проявляється при наведенні на картку. */
	hoverImage: { url: string; alt: string } | null;
	colors: string[];
	inStock: boolean;
};

export type ProductVariantView = {
	id: string;
	/** Артикул: іде в розмітку Schema.org як sku/mpn. */
	sku: string;
	size: string;
	color: string;
	colorHex: string | null;
	price: number;
	stock: number;
};

/** Характеристика товару — рядок таблиці «Склад / Країна / Догляд». */
export type ProductAttributeView = {
	name: string;
	value: string;
};

/** Фото товару. `color` = null — кадр спільний для всіх кольорів. */
export type ProductImageView = {
	url: string;
	alt: string;
	color: string | null;
};

export type ProductDetail = {
	id: string;
	slug: string;
	name: string;
	description: string;
	price: number;
	compareAt: number | null;
	category: { slug: string; name: string };
	images: ProductImageView[];
	variants: ProductVariantView[];
	/** Тільки заповнені: чого CRM не вказала, того на сторінці немає. */
	attributes: ProductAttributeView[];
};

/**
 * Спосіб доставки з порахованою датою отримання.
 * Дату рахує сервер (`$lib/delivery-estimate`), щоб вона не залежала
 * від годинника в браузері й не мінялась після гідратації.
 */
export type DeliveryOption = {
	value: string;
	label: string;
	/** Копійки. */
	cost: number;
	shipsToday: boolean;
	/** «10–12 вересня». */
	eta: string;
};

export type CatalogFacets = {
	sizes: string[];
	colors: { name: string; hex: string | null }[];
};

export type CartLine = {
	id: string;
	variantId: string;
	productName: string;
	productSlug: string;
	size: string;
	color: string;
	imageUrl: string | null;
	unitPrice: number;
	quantity: number;
	lineTotal: number;
	/** Залишок на складі — обмежує лічильник у кошику. */
	stock: number;
};

/** Довідники перевізників — те, що віддають /api/delivery/*. */
export type SettlementOption = {
	/** Ref населеного пункту — потрібен для списку відділень. */
	ref: string;
	/** Ref міста — потрібен для розрахунку вартості доставки. */
	cityRef: string;
	name: string;
	region: string;
};

export type WarehouseOption = {
	ref: string;
	number: string;
	description: string;
};

/** Уніфікований рядок списку в полі з автодоповненням. */
export type AutocompleteOption = {
	ref: string;
	label: string;
	hint?: string;
	/** Тільки для населених пунктів: ref міста для розрахунку тарифу. */
	cityRef?: string;
};

export type CartView = {
	id: string | null;
	lines: CartLine[];
	subtotal: number;
	count: number;
};
