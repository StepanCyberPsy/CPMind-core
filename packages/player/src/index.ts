import { CPMindPlayer } from './public_api.js';
import { initPlayerQueue } from './bootstrap.js';

declare global {
    interface Window {
        CPMindPlayer: typeof CPMindPlayer;
    }
}

// Публичный API объявляется до обработки очереди: instream-интеграция вызывает
// attachNative со страницы издателя и не должна зависеть от результата bootstrap
try {
    window.CPMindPlayer = CPMindPlayer;
} catch {
    // Silently fail — never break publisher page
}

try {
    initPlayerQueue();
} catch {
    // Silently fail — never break publisher page
}