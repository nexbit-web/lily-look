/**
 * Матчери jest-dom (toBeInTheDocument, toBeDisabled, …) для клієнтських
 * тестів. Підключаються в рантаймі через vitest-setup-client.ts, а тут —
 * щоб про них знав і TypeScript.
 */
import '@testing-library/jest-dom/vitest';
