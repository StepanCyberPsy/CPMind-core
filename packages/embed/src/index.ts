import { initLoader } from './loader.js';

try {
    initLoader();
} catch {
    // Loader failure must never break publisher page
}