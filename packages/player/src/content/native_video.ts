import type { ContentBridge } from './bridge.js';

// Реализует ContentBridge поверх нативного HTMLVideoElement
export class NativeContentBridge implements ContentBridge {
    private readonly video: HTMLVideoElement;
    private resumeTimeSec: number = 0;

    constructor(video: HTMLVideoElement) {
        this.video = video;
    }

    pause(): void {
        this.resumeTimeSec = this.video.currentTime;
        this.video.pause();
    }

    async resume(): Promise<void> {
        if (!this.video.isConnected) return;

        // Восстанавливаем позицию — content мог быть на любом currentTime
        if (Math.abs(this.video.currentTime - this.resumeTimeSec) > 0.5) {
            this.video.currentTime = this.resumeTimeSec;
        }

        try {
            await this.video.play();
        } catch {
            // Autoplay policy или другой transient error — fail-open,
            // пользователь увидит paused content и нажмёт play сам
        }
    }

    get onPlayRequested(): undefined {
        return undefined;
    }
}