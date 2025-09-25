// functions/src/modes/index.ts
import classic from './impl/classic';
import transmission from './impl/transmission';
import infection from './impl/infection'; // 🔸 NEW
export const handlers = {
    classic,
    transmission,
    infection, // 🔸 NEW
};
