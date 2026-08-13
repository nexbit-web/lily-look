import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

/**
 * Демо-наповнення каталогу.
 *
 * Запуск: `npm run db:seed`. Скрипт ідемпотентний — очищає каталог
 * і створює його заново, тож його безпечно ганяти скільки завгодно разів.
 *
 * Фото — заглушки з Unsplash. Перед запуском у продакшн заміни `images`
 * на власні знімки (напр. з Cloudinary / UploadThing / S3).
 */

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error('DATABASE_URL не заданий. Заповни .env перед запуском сидів.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Жорсткий кроп 1200×1600 (3:4) — усі картки й галереї розраховані на цю пропорцію. */
const photo = (id: string) =>
	`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&h=1600&q=80`;

const CATEGORIES = [
	{ slug: 'sukni', name: 'Сукні', position: 1 },
	{ slug: 'verkhniy-odiah', name: 'Верхній одяг', position: 2 },
	{ slug: 'kostiumy', name: 'Костюми', position: 3 },
	{ slug: 'bluzy', name: 'Блузи та сорочки', position: 4 },
	{ slug: 'spidnytsi', name: 'Спідниці', position: 5 },
	{ slug: 'trykotazh', name: 'Трикотаж', position: 6 }
];

type SeedProduct = {
	slug: string;
	name: string;
	description: string;
	category: string;
	/** Ціни — у копійках. */
	price: number;
	compareAt?: number;
	featured?: boolean;
	images: string[];
	sizes: string[];
	colors: { name: string; hex: string }[];
};

const PRODUCTS: SeedProduct[] = [
	{
		slug: 'suknia-midi-amelie',
		name: 'Сукня-міді Amélie',
		description:
			'Класична сукня-міді з віскози з приталеним ліфом і вільною спідницею. Тримає форму, не мнеться в дорозі й однаково доречна на роботі та вечері.',
		category: 'sukni',
		price: 219900,
		compareAt: 269900,
		featured: true,
		images: ['1515372039744-b8f02a3ae446', '1483985988355-763728e1935b'],
		sizes: ['XS', 'S', 'M', 'L'],
		colors: [
			{ name: 'Молочний', hex: '#EFE9E1' },
			{ name: 'Чорний', hex: '#1C1917' }
		]
	},
	{
		slug: 'suknia-satynova-olivia',
		name: 'Сатинова сукня Olivia',
		description:
			'Сатин зі шляхетним блиском, бретелі регулюються, підкладка по всій довжині. Ідеальна база для святкового образу.',
		category: 'sukni',
		price: 264900,
		featured: true,
		images: ['1490481651871-ab68de25d43d', '1479064555552-3ef4979f8908'],
		sizes: ['S', 'M', 'L'],
		colors: [
			{ name: 'Смарагдовий', hex: '#0F5132' },
			{ name: 'Пудровий', hex: '#E4C4C0' }
		]
	},
	{
		slug: 'suknia-trykotazhna-nora',
		name: 'Трикотажна сукня Nora',
		description:
			'М’який щільний трикотаж рубчик, довжина міді, високий комір. Найзатишніша річ у гардеробі на прохолодні місяці.',
		category: 'sukni',
		price: 179900,
		images: ['1441984904996-e0b6ba687e04', '1487222477894-8943e31ef7b2'],
		sizes: ['XS', 'S', 'M', 'L', 'XL'],
		colors: [
			{ name: 'Мокко', hex: '#6F5B4E' },
			{ name: 'Графітовий', hex: '#3F3F46' }
		]
	},
	{
		slug: 'palto-oversize-margo',
		name: 'Пальто-оверсайз Margo',
		description:
			'Вовняне пальто прямого крою з приспущеним плечем і поясом у комплекті. 70% вовна, підкладка з віскози.',
		category: 'verkhniy-odiah',
		price: 549900,
		compareAt: 649900,
		featured: true,
		images: ['1469334031218-e382a71b716b', '1496747611176-843222e1e57c'],
		sizes: ['S', 'M', 'L'],
		colors: [
			{ name: 'Кемел', hex: '#B08D57' },
			{ name: 'Сірий меланж', hex: '#8B8B87' }
		]
	},
	{
		slug: 'trench-classic-vivienne',
		name: 'Тренч Vivienne',
		description:
			'Класичний двобортний тренч із бавовняної саржі, знімний пояс, кокетка на спинці. Витримає київський жовтень.',
		category: 'verkhniy-odiah',
		price: 489900,
		images: ['1539109136881-3be0616acf4b', '1524504388940-b1c1722653e1'],
		sizes: ['XS', 'S', 'M', 'L'],
		colors: [
			{ name: 'Бежевий', hex: '#D9C7A7' },
			{ name: 'Чорний', hex: '#1C1917' }
		]
	},
	{
		slug: 'kurtka-stebana-lea',
		name: 'Стьобана куртка Léa',
		description:
			'Легка стьобана куртка на синтепоні з водовідштовхувальним покриттям. Складається в компактний згорток.',
		category: 'verkhniy-odiah',
		price: 329900,
		images: ['1485462537746-965f33f7f6a7', '1509319117193-57bab727e09d'],
		sizes: ['S', 'M', 'L', 'XL'],
		colors: [
			{ name: 'Оливковий', hex: '#5A6144' },
			{ name: 'Чорний', hex: '#1C1917' }
		]
	},
	{
		slug: 'kostium-zhaket-brudy-elise',
		name: 'Костюм Elise: жакет + брюки',
		description:
			'Подовжений жакет на підкладці й прямі брюки зі стрілками. Костюмна тканина з домішкою еластану — не витягується на колінах.',
		category: 'kostiumy',
		price: 499900,
		compareAt: 579900,
		featured: true,
		images: ['1503342217505-b0a15ec3261c', '1502716119720-b23a93e5fe1b'],
		sizes: ['XS', 'S', 'M', 'L'],
		colors: [
			{ name: 'Молочний', hex: '#EFE9E1' },
			{ name: 'Чорний', hex: '#1C1917' }
		]
	},
	{
		slug: 'kostium-lniany-sofia',
		name: 'Лляний костюм Sofia',
		description:
			'Сорочка вільного крою і брюки-палаццо зі 100% льону. Дихає в спеку, з часом стає лише м’якшим.',
		category: 'kostiumy',
		price: 419900,
		images: ['1518049362265-d5b2a6467637', '1544022613-e87ca75a784a'],
		sizes: ['S', 'M', 'L'],
		colors: [
			{ name: 'Пісочний', hex: '#DCC9A8' },
			{ name: 'Небесний', hex: '#A8BFD0' }
		]
	},
	{
		slug: 'bluza-shovkova-camille',
		name: 'Шовкова блуза Camille',
		description:
			'Блуза з натурального шовку з французькою манжетою і потайною планкою. Заправляється в спідницю без зайвого об’єму.',
		category: 'bluzy',
		price: 239900,
		images: ['1595777457583-95e059d581b8', '1551163943-3f6a855d1153'],
		sizes: ['XS', 'S', 'M', 'L'],
		colors: [
			{ name: 'Слонова кістка', hex: '#F3EDE3' },
			{ name: 'Винний', hex: '#6E2A3A' }
		]
	},
	{
		slug: 'sorochka-oversize-june',
		name: 'Сорочка-оверсайз June',
		description:
			'Бавовняна сорочка вільного крою з подовженою спинкою. Носиться і як сорочка, і як легка накидка.',
		category: 'bluzy',
		price: 159900,
		compareAt: 189900,
		images: ['1576995853123-5a10305d93c0', '1571945153237-4929e783af4a'],
		sizes: ['S', 'M', 'L', 'XL'],
		colors: [
			{ name: 'Білий', hex: '#FAFAF9' },
			{ name: 'Блакитна смужка', hex: '#B9CBDD' }
		]
	},
	{
		slug: 'spidnytsia-plisse-adele',
		name: 'Спідниця пліссе Adèle',
		description:
			'Спідниця-пліссе довжини міді на еластичному поясі. Тримає складку після прання, не потребує прасування.',
		category: 'spidnytsi',
		price: 189900,
		featured: true,
		images: ['1594633312681-425c7b97ccd1', '1566174053879-31528523f8ae'],
		sizes: ['XS', 'S', 'M', 'L'],
		colors: [
			{ name: 'Шампань', hex: '#E8D9BE' },
			{ name: 'Чорний', hex: '#1C1917' }
		]
	},
	{
		slug: 'spidnytsia-shkirjana-rue',
		name: 'Спідниця з екошкіри Rue',
		description:
			'Пряма спідниця з м’якої екошкіри з розрізом ззаду і високою посадкою. Тримає силует, не блищить на фото.',
		category: 'spidnytsi',
		price: 209900,
		images: ['1462927114214-6956d2fddd4e', '1515372039744-b8f02a3ae446'],
		sizes: ['XS', 'S', 'M'],
		colors: [
			{ name: 'Чорний', hex: '#1C1917' },
			{ name: 'Коричневий', hex: '#5B4034' }
		]
	},
	{
		slug: 'sviter-kashemir-lune',
		name: 'Кашеміровий светр Lune',
		description:
			'Светр із суміші кашеміру та вовни мериноса. Не колеться, майже не пілінгується, тримає форму горловини.',
		category: 'trykotazh',
		price: 299900,
		featured: true,
		images: ['1483985988355-763728e1935b', '1490481651871-ab68de25d43d'],
		sizes: ['S', 'M', 'L'],
		colors: [
			{ name: 'Вершковий', hex: '#EDE4D8' },
			{ name: 'Сірий', hex: '#9CA3AF' }
		]
	},
	{
		slug: 'kardigan-dovhyi-ines',
		name: 'Подовжений кардиган Inès',
		description:
			'Кардиган нижче колін із кишенями по боках. Найуніверсальніший верхній шар для міжсезоння.',
		category: 'trykotazh',
		price: 249900,
		compareAt: 289900,
		images: ['1479064555552-3ef4979f8908', '1441984904996-e0b6ba687e04'],
		sizes: ['S', 'M', 'L', 'XL'],
		colors: [
			{ name: 'Бежевий', hex: '#D9C7A7' },
			{ name: 'Графітовий', hex: '#3F3F46' }
		]
	}
];

/** Псевдовипадковий, але стабільний залишок — щоб сиди були відтворюваними. */
function stockFor(index: number): number {
	const pattern = [6, 3, 0, 9, 4, 12, 2, 7, 5, 1, 8, 10];
	return pattern[index % pattern.length];
}

async function main() {
	console.log('Очищення каталогу…');
	// Порядок важливий: спершу те, що посилається, потім те, на що посилаються.
	await prisma.orderItem.deleteMany();
	await prisma.order.deleteMany();
	await prisma.cartItem.deleteMany();
	await prisma.cart.deleteMany();
	await prisma.productImage.deleteMany();
	await prisma.productVariant.deleteMany();
	await prisma.product.deleteMany();
	await prisma.category.deleteMany();

	console.log('Створення категорій…');
	await prisma.category.createMany({ data: CATEGORIES });
	const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
	const categoryId = new Map(categories.map((category) => [category.slug, category.id]));

	console.log('Створення товарів…');
	let variantCounter = 0;

	for (const product of PRODUCTS) {
		const id = categoryId.get(product.category);
		if (!id) throw new Error(`Невідома категорія: ${product.category}`);

		await prisma.product.create({
			data: {
				slug: product.slug,
				name: product.name,
				description: product.description,
				price: product.price,
				compareAt: product.compareAt ?? null,
				isFeatured: product.featured ?? false,
				categoryId: id,
				images: {
					create: product.images.map((imageId, position) => ({
						url: photo(imageId),
						alt: `${product.name} — фото ${position + 1}`,
						position
					}))
				},
				variants: {
					create: product.colors.flatMap((color) =>
						product.sizes.map((size) => ({
							sku: `${product.slug}-${size}-${color.name}`.toUpperCase().replace(/\s+/g, '-'),
							size,
							color: color.name,
							colorHex: color.hex,
							stock: stockFor(variantCounter++)
						}))
					)
				}
			}
		});
	}

	const [productCount, variantCount] = await Promise.all([
		prisma.product.count(),
		prisma.productVariant.count()
	]);

	console.log(
		`Готово: ${CATEGORIES.length} категорій, ${productCount} товарів, ${variantCount} варіантів.`
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
