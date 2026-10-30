/**
 * Интерактивный креатив SIMID 1.2.
 *
 * Исполняется плеером площадки в кросс-доменном iframe и общается с плеером
 * только через postMessage. Задача одна: собрать то, о чём плеер сообщает сам, —
 * состояние воспроизведения и параметры своего окружения — и отправить отчёт
 * в CPMind. Видимости и окружения страницы издателя здесь нет: iframe о странице
 * не знает ничего, и источником S1-S7 остаётся ветка OMID.
 */

import {
    buildReject,
    buildResolve,
    buildSimidMessage,
    createSessionId,
    CREATE_SESSION_MESSAGE_ID,
    CREATE_SESSION_TYPE,
    parseSimidMessage,
} from './simid/protocol.js';
import {
    applyMediaEvent,
    createPlaybackState,
    type SimidPlaybackState,
} from './simid/accumulator.js';
import {
    buildSimidReport,
    normalizeDimension,
    normalizeSkippableState,
    type SimidEndReasonValue,
    type SimidEnvironmentSnapshot,
} from './simid/report.js';
import { buildSimidEndpoint, sendMeasurement } from './transport.js';

declare const SIMID_RUNTIME_VERSION: string;

// SIMID 1.2 §9: код для ошибок, не предусмотренных спецификацией
const CREATIVE_ERROR_UNSPECIFIED = 1100;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(source: Record<string, unknown>, key: string): boolean | null {
    const value = source[key];
    return typeof value === 'boolean' ? value : null;
}

function emptyEnvironment(): SimidEnvironmentSnapshot {
    return {
        simidVersion: null,
        mutedAtStart: null,
        volumeAtStart: null,
        fullscreen: null,
        fullscreenAllowed: null,
        skippableState: null,
        videoWidth: null,
        videoHeight: null,
        creativeWidth: null,
        creativeHeight: null,
    };
}

/**
 * Разбор environmentData из SIMID:Player:init. Плеер — чужая реализация,
 * и обязательность полей в спецификации не гарантирует их наличия: каждое
 * значение берётся отдельно, отсутствующее остаётся null.
 */
export function readEnvironment(args: unknown): SimidEnvironmentSnapshot {
    const snapshot = emptyEnvironment();
    if (!isRecord(args)) return snapshot;

    const environment = args['environmentData'];
    if (!isRecord(environment)) return snapshot;

    const version = environment['version'];
    snapshot.simidVersion = typeof version === 'string' && version.length > 0
        ? version.slice(0, 32)
        : null;

    snapshot.mutedAtStart = readBoolean(environment, 'muted');

    const volume = readNumber(environment, 'volume');
    snapshot.volumeAtStart = volume === null
        ? null
        : Math.min(1, Math.max(0, volume));

    snapshot.fullscreen = readBoolean(environment, 'fullscreen');
    snapshot.fullscreenAllowed = readBoolean(environment, 'fullscreenAllowed');
    snapshot.skippableState = normalizeSkippableState(environment['skippableState']);

    const videoDimensions = environment['videoDimensions'];
    if (isRecord(videoDimensions)) {
        snapshot.videoWidth = normalizeDimension(videoDimensions['width']);
        snapshot.videoHeight = normalizeDimension(videoDimensions['height']);
    }

    const creativeDimensions = environment['creativeDimensions'];
    if (isRecord(creativeDimensions)) {
        snapshot.creativeWidth = normalizeDimension(creativeDimensions['width']);
        snapshot.creativeHeight = normalizeDimension(creativeDimensions['height']);
    }

    return snapshot;
}

/**
 * Параметры доставляются через VAST <AdParameters> и приходят в creativeData
 * строкой. Без них отчёт отправить некуда, поэтому креатив отвечает на init
 * отказом: плеер получит внятную причину вместо молчания.
 */
export function readAdParameters(args: unknown): { sid: string; collectEndpoint: string } | null {
    if (!isRecord(args)) return null;

    const creativeData = args['creativeData'];
    if (!isRecord(creativeData)) return null;

    const raw = creativeData['adParameters'];
    if (typeof raw !== 'string' || raw.length === 0) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (!isRecord(parsed)) return null;

    const sid = parsed['sid'];
    const collectEndpoint = parsed['collect_endpoint'];

    if (typeof sid !== 'string' || sid.length === 0) return null;
    if (typeof collectEndpoint !== 'string' || collectEndpoint.length === 0) return null;

    return { sid, collectEndpoint };
}

function start(): void {
    const parent = window.parent;
    if (parent === window) return;

    const sessionId = createSessionId();
    const startedAt = Date.now();

    let nextMessageId = CREATE_SESSION_MESSAGE_ID;
    let context: { sid: string; collectEndpoint: string } | null = null;
    let environment: SimidEnvironmentSnapshot = emptyEnvironment();
    let state: SimidPlaybackState | null = null;
    let reportSent = false;

    // Целевой источник плеера неизвестен: креатив размещается на произвольной
    // площадке, и способа узнать её источник в SIMID нет. Наружу уходят только
    // подтверждения протокола, собственных данных CPMind в них нет
    function post(message: unknown): void {
        try {
            parent.postMessage(JSON.stringify(message), '*');
        } catch {
            // Разрыв канала с плеером не должен ронять креатив
        }
    }

    function allocateMessageId(): number {
        nextMessageId += 1;
        return nextMessageId;
    }

    function resolve(inResponseTo: number, value: unknown = {}): void {
        post(buildResolve(sessionId, allocateMessageId(), inResponseTo, value));
    }

    function reject(inResponseTo: number, message: string): void {
        post(buildReject(
            sessionId,
            allocateMessageId(),
            inResponseTo,
            CREATIVE_ERROR_UNSPECIFIED,
            message,
        ));
    }

    function sendReport(endReason: SimidEndReasonValue): void {
        if (reportSent) return;
        if (context === null || state === null) return;

        reportSent = true;

        sendMeasurement(
            buildSimidEndpoint(context.collectEndpoint),
            buildSimidReport(
                context.sid,
                SIMID_RUNTIME_VERSION,
                endReason,
                startedAt,
                Date.now(),
                state,
                environment,
            ),
        );
    }

    function track(event: Parameters<typeof applyMediaEvent>[1]): void {
        if (state === null) return;
        applyMediaEvent(state, event);
    }

    function handleInit(messageId: number, args: unknown): void {
        environment = readEnvironment(args);
        context = readAdParameters(args);

        if (context === null) {
            reject(messageId, 'SIMID_AD_PARAMETERS_MISSING');
            return;
        }

        state = createPlaybackState({
            muted: environment.mutedAtStart ?? false,
            volume: environment.volumeAtStart ?? 1,
        });

        resolve(messageId);
    }

    function handleMessage(message: { messageId: number; type: string; args: unknown }): void {
        const args = isRecord(message.args) ? message.args : {};

        switch (message.type) {
            case 'SIMID:Player:init': {
                handleInit(message.messageId, message.args);
                return;
            }
            /**
             * Ответ на startCreative намеренно не отправляется.
             *
             * SIMID 1.2 §4.3.10.1 и §6.9: плеер делает iframe видимым только
             * получив resolve, и для видеорекламы обязан растянуть его на весь
             * медиаэлемент. Наш креатив ничего не рисует, но перекрытый iframe
             * перехватывает клик по видео, а исполнение clickthrough SIMID
             * возлагает на креатив (§4.4.1). Ответив resolve, мы либо убиваем
             * клик, либо обязаны сами открывать посадочную страницу.
             *
             * Пока iframe остаётся скрытым: события SIMID:Media приходят после
             * resolve на init и от startCreative не зависят, поэтому данные мы
             * получаем полностью, а реклама остаётся нетронутой. Цена — плеер
             * по завершении медиа отправляет VAST error 1213 (§4.3.10.1).
             *
             * Выбор между этим поведением и передачей клика через креатив
             * требует отдельного решения: он затрагивает клик, а не измерение
             */
            case 'SIMID:Player:startCreative': {
                return;
            }
            case 'SIMID:Media:durationchange': {
                track({ kind: 'durationchange', duration: readNumber(args, 'duration') ?? 0 });
                return;
            }
            case 'SIMID:Media:timeupdate': {
                const currentTime = readNumber(args, 'currentTime');
                if (currentTime !== null) track({ kind: 'timeupdate', currentTime });
                return;
            }
            case 'SIMID:Media:volumechange': {
                track({
                    kind: 'volumechange',
                    volume: readNumber(args, 'volume') ?? 0,
                    muted: readBoolean(args, 'muted') ?? false,
                });
                return;
            }
            case 'SIMID:Media:pause': {
                track({ kind: 'pause' });
                return;
            }
            case 'SIMID:Media:play':
            case 'SIMID:Media:playing': {
                track({ kind: 'play' });
                return;
            }
            case 'SIMID:Media:seeked': {
                const currentTime = readNumber(args, 'currentTime');
                if (currentTime !== null) track({ kind: 'seeked', currentTime });
                return;
            }
            case 'SIMID:Media:stalled': {
                track({ kind: 'stalled' });
                return;
            }
            case 'SIMID:Media:error': {
                track({ kind: 'error', errorCode: readNumber(args, 'errorCode') });
                return;
            }
            case 'SIMID:Media:ended': {
                track({ kind: 'ended' });
                sendReport('ended');
                return;
            }

            // Плеер снимает рекламу и ждёт подтверждения перед выгрузкой iframe
            // (SIMID 1.2 §6.9): отчёт отправляется до ответа
            case 'SIMID:Player:adSkipped': {
                sendReport('adSkipped');
                resolve(message.messageId);
                return;
            }
            case 'SIMID:Player:adStopped': {
                sendReport('adStopped');
                resolve(message.messageId);
                return;
            }
            case 'SIMID:Player:fatalError': {
                sendReport('fatalError');
                resolve(message.messageId);
                return;
            }
            default: {
                return;
            }
        }
    }

    window.addEventListener('message', (event: MessageEvent) => {
        const message = parseSimidMessage(event.data);
        if (message === null) return;
        if (message.sessionId !== sessionId) return;

        // resolve и reject на наши собственные запросы подтверждений не требуют
        if (message.type === 'resolve' || message.type === 'reject') return;

        handleMessage(message);
    });

    // Взаимодействия внутри нашего iframe. Событий вне него креатив не видит,
    // поэтому отсутствие взаимодействий ничего не доказывает
    const trackInteraction = (): void => {
        track({ kind: 'interaction' });
    };
    const interactionOptions = { capture: true, passive: true } as const;
    window.addEventListener('pointerdown', trackInteraction, interactionOptions);
    window.addEventListener('keydown', trackInteraction, interactionOptions);

    // Плеер вправе выгрузить iframe, не дождавшись обмена сообщениями
    window.addEventListener('pagehide', () => {
        sendReport('unload');
    });

    post(buildSimidMessage(sessionId, CREATE_SESSION_MESSAGE_ID, CREATE_SESSION_TYPE, {}));
}

if (typeof window !== 'undefined') {
    start();
}
