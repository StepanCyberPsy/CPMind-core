import { PLAYER_CSS } from '../player-config.js';

export function ensurePlayerStyles(): void {
    if (document.querySelector('[data-cpmind-styles]') !== null) return;
    const style = document.createElement('style');
    style.setAttribute('data-cpmind-styles', '');
    style.textContent = PLAYER_CSS;
    document.head.appendChild(style);
}