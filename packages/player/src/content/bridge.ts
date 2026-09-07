// ContentBridge — интерфейс взаимодействия Player с content player паблишера.
// mandatory: pause/resume управляют воспроизведением контента вокруг ad break.
// optional: onPlayRequested позволяет паблишеру контролировать когда Player запускается
export interface ContentBridge {
    pause(): void;
    resume(): Promise<void>;
    onPlayRequested?: ((startAd: () => void) => void) | undefined;
}