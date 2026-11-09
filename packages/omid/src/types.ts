/**
 * Срез API OMID, на который опирается скрипт верификации.
 * Типы описаны по OMID API 1.5 и намеренно ограничены тем, что мы читаем:
 * клиент IAB типов не поставляет, а копировать всю спецификацию незачем.
 */

export type OmidAccessMode = 'full' | 'limited' | 'domain';

// Прямоугольник в координатах окна, значения в плотностно-независимых пикселях
export interface OmidRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Причины, по которым реклама не видна полностью. OMID 1.5, geometryChange
export type OmidViewabilityReason =
    | 'notFound'
    | 'hidden'
    | 'backgrounded'
    | 'viewport'
    | 'obstructed'
    | 'clipped'
    | 'noWindowFocus'
    | 'noOutputDevice';

export interface OmidAdView {
    percentageInView: number;
    geometry: OmidRectangle;
    onScreenGeometry: OmidRectangle & { obstructions?: OmidRectangle[] };
    pixelsInView?: number;
    reasons?: OmidViewabilityReason[];
}

export interface OmidViewport {
    width: number;
    height: number;
}

export interface OmidContext {
    apiVersion?: string;
    environment?: 'app' | 'web';
    accessMode?: OmidAccessMode;

    // Диагностическое поле compliance/validation-скриптов IAB.
    // Его отсутствие в исходном sessionStart не означает запрет доступа.
    friendlyToTop?: boolean;

    supports?: string[];
    omidJsInfo?: Record<string, unknown>;
    deviceCategory?: string;

    // Передаются только в режиме full: ссылки на элементы рендеринга
    videoElement?: HTMLVideoElement;
    slotElement?: Element;
}

export interface OmidSessionEvent {
    adSessionId: string;
    timestamp: number;
    type: 'sessionStart' | 'sessionFinish' | 'sessionError';
    data: {
        context?: OmidContext;
        verificationParameters?: string;
        errorType?: string;
        message?: string;
    };
}

export interface OmidGeometryChangeEvent {
    timestamp: number;
    data: {
        viewport: OmidViewport;
        adView: OmidAdView;
    };
}

export interface OmidMediaEvent {
    type: string;
    timestamp: number;
    data?: {
        deviceVolume?: number;
        mediaPlayerVolume?: number;
        videoPlayerVolume?: number;
        duration?: number;
        state?: string;
        skippable?: boolean;
        skipOffset?: number;
        autoPlay?: boolean;
        position?: string;
        interactionType?: string;
    };
}

// Минимальный интерфейс клиента IAB, который использует скрипт
export interface OmidVerificationClientLike {
    isSupported(): boolean;
    registerSessionObserver(
        observer: (event: OmidSessionEvent) => void,
        vendorKey?: string,
    ): void;
    addEventListener(type: string, listener: (event: unknown) => void): void;
}

// Параметры показа, переданные сервером в <VerificationParameters>
export interface CpmindVerificationParams {
    sid: string;
    tag_uuid: string;
    tag_constants_version: string;
    campaign_id: string;
    creative_id: string;
    creative_type: string;
    placement_uuid: string;
    creative_version_uuid: string;
    delivery_kind: 'inline' | 'wrapper';
    collect_endpoint: string;

    // Нужны ветке с коллекторами страницы: SDK строит по ним идентификатор
    // сессии и конфигурацию сигналов
    delivery_mode: string;
    tag_constants: Record<string, unknown>;
}

/**
 * Контракт между загрузчиком и веткой коллекторов страницы.
 * Ветка публикует фабрику в глобале проверенного окна страницы с ключом версии
 * runtime. Повторный вызов start для того же OMID-показа возвращает пассивный
 * handle: он не запускает SDK и не дублирует partial, media или финализацию.
 */
export interface CpmindOmidFullInput {
    params: CpmindVerificationParams;
    context: OmidContext;
    startedAt: number;
    omidSessionId?: string;
}

export interface CpmindOmidFullBranch {
    start(input: CpmindOmidFullInput): CpmindOmidFullSession | null;
    hasRun?(input: CpmindOmidFullInput): boolean;
}

export interface CpmindOmidFullSession {
    reportMediaEvent(event: OmidMediaEvent): void;
    finalize(): void;
}
