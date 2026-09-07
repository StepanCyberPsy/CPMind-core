import { CPMindPlayer } from './public_api.js';

declare global {
    interface Window {
        CPMindPlayer: typeof CPMindPlayer;
    }
}

try {
    window.CPMindPlayer = CPMindPlayer;
} catch {
    // Silently fail — never break publisher page
}