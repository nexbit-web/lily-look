import adapter from '@sveltejs/adapter-node';

/**
 * Конфіг SvelteKit.
 *
 * Усі налаштування — саме тут, а не інлайном у `sveltekit()`: інлайн-обʼєкт
 * повністю заміняє цей файл, а його читають і зовнішні збирачі. Hostinger,
 * наприклад, шукає через нього теку зі збіркою.
 *
 * @type {import('@sveltejs/kit').Config}
 */
export default {
	compilerOptions: {
		// Runes для всього проєкту, крім бібліотек. Прибрати можна в Svelte 6.
		// Шлях перевіряємо підрядком: розділювач різний на Windows і Linux.
		runes: ({ filename }) => (filename.includes('node_modules') ? undefined : true)
	},

	kit: {
		// adapter-node: збірка стає звичайним Node-сервером, який
		// запускається `node dist` (npm start) і слухає $PORT.
		//
		// Тека саме `dist`, а не типова для SvelteKit `build`: деплой
		// Hostinger шукає результат складання за цією назвою і без неї
		// відповідає «No output directory found after build».
		adapter: adapter({ out: 'dist' })
	}
};
