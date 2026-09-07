// Создаёт и конфигурирует <video> элемент для воспроизведения рекламы.
// Не добавляет в DOM — caller отвечает за монтирование
export function createAdVideoElement(muted: boolean): HTMLVideoElement {
    const video = document.createElement('video');

    video.muted = muted;
    video.autoplay = false;
    video.controls = false;
    video.preload = 'auto';
    video.playsInline = true;

    // iOS Safari: без этого атрибута видео открывается в системном fullscreen плеере
    video.setAttribute('webkit-playsinline', '');

    // Отключает системный AirPlay/Chromecast индикатор —
    // рекламный контент не должен транслироваться на внешние устройства
    video.disableRemotePlayback = true;

    // Явно скрываем нативные субтитры/текстовые дорожки если браузер их добавит
    video.textTracks.addEventListener('addtrack', (e) => {
        if (e.track !== null) {
            e.track.mode = 'hidden';
        }
    });

    video.style.display = 'block';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    video.style.backgroundColor = '#000';

    return video;
}

// Освобождает ресурсы video element.
// Обязателен при destroy Player — предотвращает утечки памяти при multi-player сценариях
export function disposeVideoElement(video: HTMLVideoElement): void {
    video.pause();
    video.removeAttribute('src');
    // video.load() после удаления src — прерывает любые pending network requests
    video.load();
    video.remove();
}