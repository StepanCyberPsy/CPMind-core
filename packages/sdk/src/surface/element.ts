export class MeasuredElement {
    readonly el: HTMLElement;
    private observer: MutationObserver | null = null;
    private disposed = false;

    constructor(el: HTMLElement, onRemoved?: () => void) {
        this.el = el;

        if (onRemoved) {
            this.observer = new MutationObserver(() => {
                if (!this.el.isConnected) {
                    onRemoved();
                    this.dispose();
                }
            });

            this.observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
            });
        }
    }

    get isConnected(): boolean {
        return this.el.isConnected;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.observer?.disconnect();
        this.observer = null;
    }
}