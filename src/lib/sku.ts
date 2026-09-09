/**
 * Артикул моделі.
 *
 * У БД артикул є тільки у варіанта — з розміром і кольором усередині
 * (`OLIVIA-S-PUDRA`). Покупцеві ж потрібен код самої моделі: саме його він
 * називає менеджеру. Виводимо його зі спільного початку всіх варіантів —
 * так CRM не мусить вести окреме поле, а сторінка не показує артикул
 * випадкового розміру як загальний.
 */
export function modelSku(skus: string[]): string | null {
	if (skus.length === 0) return null;

	let prefix = skus[0];
	for (const sku of skus.slice(1)) {
		let length = 0;
		while (length < prefix.length && length < sku.length && prefix[length] === sku[length]) {
			length++;
		}
		prefix = prefix.slice(0, length);
	}

	// Хвостовий роздільник читається як обірваний рядок, а не як код.
	prefix = prefix.replace(/[-_/\s]+$/, '');

	// Випадковий збіг у пару літер артикулом не є — краще не показати нічого.
	return prefix.length >= 3 ? prefix : null;
}
