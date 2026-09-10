export interface VideoDiscoveryOptions {
    selector: string | null;
    onVideoFound(video: HTMLVideoElement): void;
}

export interface VideoDiscovery {
    destroy(): void;
}

const DEFAULT_VIDEO_SELECTOR = 'video';
const AD_SURFACE_SELECTOR = '[data-cpmind-surface]';

// Находит content video издателя и наблюдает за появлением новых.
// Селектор задаётся в placement: null означает все video на странице.
// Элементы внутри рекламной поверхности исключаются — иначе player привязался бы
// к собственному video и запустил бесконечную рекурсию pre-roll
export function observeContentVideos(
    opts: VideoDiscoveryOptions,
): VideoDiscovery {
    const selector = opts.selector ?? DEFAULT_VIDEO_SELECTOR;
    const bound = new WeakSet<HTMLVideoElement>();

    let observer: MutationObserver | null = null;
    let domReadyHandler: (() => void) | null = null;

    function isEligible(el: Element): el is HTMLVideoElement {
        if (!(el instanceof HTMLVideoElement)) return false;
        if (bound.has(el)) return false;
        if (el.closest(AD_SURFACE_SELECTOR) !== null) return false;
        return true;
    }

    function bind(el: HTMLVideoElement): void {
        bound.add(el);
        opts.onVideoFound(el);
    }

    // Невалидный CSS-селектор из placement не должен ронять runtime —
    // querySelectorAll и matches бросают SyntaxError
    function scan(root: ParentNode): void {
        let found: Element[];

        try {
            found = Array.from(root.querySelectorAll(selector));
        } catch {
            return;
        }

        for (const el of found) {
            if (isEligible(el)) bind(el);
        }
    }

    function matchesSelector(el: Element): boolean {
        try {
            return el.matches(selector);
        } catch {
            return false;
        }
    }

    scan(document);

    if (document.readyState === 'loading') {
        domReadyHandler = (): void => { scan(document); };
        document.addEventListener('DOMContentLoaded', domReadyHandler, { once: true });
    }

    observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of Array.from(record.addedNodes)) {
                if (!(node instanceof Element)) continue;

                if (matchesSelector(node) && isEligible(node)) {
                    bind(node);
                }

                scan(node);
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    return {
        destroy(): void {
            observer?.disconnect();
            observer = null;

            if (domReadyHandler !== null) {
                document.removeEventListener('DOMContentLoaded', domReadyHandler);
                domReadyHandler = null;
            }
        },
    };
}