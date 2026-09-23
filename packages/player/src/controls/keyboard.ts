import type { PlayerActionSource } from '@cpmind/shared';

export interface KeyboardControls {
    destroy(): void;
}

export interface KeyboardControlsCallbacks {
    onPlayPause(source: PlayerActionSource): void;
    onMuteToggle(source: PlayerActionSource): void;
    onSeekForward(source: PlayerActionSource): void;
    onSeekBackward(source: PlayerActionSource): void;
}

// Разрешённые действия с клавиатуры. Набор повторяет состав экранных контролов:
// out-stream не даёт управления паузой и позицией, только звуком
export interface KeyboardControlsPermissions {
    playPause: boolean;
    seek: boolean;
}

const SEEK_STEP_SEC = 5;

// Keyboard controls — Space/K (play/pause), M (mute), ←/→ (seek ±5s)
// Привязывается к surface element для изоляции от глобальных shortcuts страницы
export function createKeyboardControls(
    surface: HTMLElement,
    permissions: KeyboardControlsPermissions,
    callbacks: KeyboardControlsCallbacks,
): KeyboardControls {
    // tabIndex = 0 чтобы surface мог принимать фокус
    surface.tabIndex = 0;

    const onKeyDown = (e: KeyboardEvent): void => {
        // Игнорируем если focus на input/textarea паблишера
        const target = e.target as HTMLElement;
        if (target !== surface && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
        )) return;

        const source: PlayerActionSource = 'user';

        switch (e.code) {
            case 'Space':
            case 'KeyK': {
                if (!permissions.playPause) break;
                e.preventDefault();
                callbacks.onPlayPause(source);
                break;
            }
            case 'KeyM': {
                e.preventDefault();
                callbacks.onMuteToggle(source);
                break;
            }
            case 'ArrowRight': {
                if (!permissions.seek) break;
                e.preventDefault();
                callbacks.onSeekForward(source);
                break;
            }
            case 'ArrowLeft': {
                if (!permissions.seek) break;
                e.preventDefault();
                callbacks.onSeekBackward(source);
                break;
            }
        }
    };

    surface.addEventListener('keydown', onKeyDown);

    return {
        destroy(): void {
            surface.removeEventListener('keydown', onKeyDown);
            surface.removeAttribute('tabindex');
        },
    };
}

export { SEEK_STEP_SEC };