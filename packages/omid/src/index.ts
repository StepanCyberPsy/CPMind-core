import { OmidVerificationClient } from '@iabtechlab-omsdk/open-measurement/omsdk-js/Verification-Client/omid-verification-client-v1.js';
import { detectDeviceType } from '@cpmind/sdk';
import { CPMIND_OMID_VENDOR } from './vendor.js';
import {
    resolveAccessLevel,
    shouldUsePageCollectors,
    getAccessibleTopWindow,
    type AccessLevel,
} from './gate.js';
import {
    createLimitedState,
    onGeometryChange,
    onMediaEvent,
    finalizeAudibleTime,
    averageSharePct,
    type LimitedState,
} from './limited.js';
import { loadFullBranch } from './loader.js';
import { buildPartialEndpoint, sendMeasurement } from './transport.js';
import type {
    CpmindOmidFullSession,
    CpmindVerificationParams,
    OmidGeometryChangeEvent,
    OmidMediaEvent,
    OmidSessionEvent,
    OmidVerificationClientLike,
} from './types.js';

declare const OMID_RUNTIME_VERSION: string;

interface MeasurementRun {
    params: CpmindVerificationParams;
    accessLevel: AccessLevel;

    // Загружена ли ветка с коллекторами страницы. Ложь при полном уровне доступа
    // означает, что догрузка не состоялась: такой показ нельзя выдавать за полный
    pageCollectorsLoaded: boolean;

    state: LimitedState;
    startedAt: number;
    sent: boolean;

    // Активная ветка коллекторов страницы. Пока она не подключилась,
    // параллельно работает ограниченная — измерение не простаивает
    full: CpmindOmidFullSession | null;
}

let run: MeasurementRun | null = null;

function parseParams(raw: string | undefined): CpmindVerificationParams | null {
    if (raw === undefined || raw === '') return null;
    try {
        return JSON.parse(raw) as CpmindVerificationParams;
    } catch {
        return null;
    }
}

function buildPayload(current: MeasurementRun, endTimestamp: number): unknown {
    finalizeAudibleTime(current.state, endTimestamp);

    const s = current.state;

    return {
        omid_runtime_version: OMID_RUNTIME_VERSION,
        access_level: current.accessLevel,
        page_collectors_loaded: current.pageCollectorsLoaded,

        sid: current.params.sid,
        tag_uuid: current.params.tag_uuid,
        tag_constants_version: current.params.tag_constants_version,
        campaign_id: current.params.campaign_id,
        creative_id: current.params.creative_id,
        creative_type: current.params.creative_type,
        placement_uuid: current.params.placement_uuid,
        creative_version_uuid: current.params.creative_version_uuid,
        delivery_kind: current.params.delivery_kind,

        // Тип устройства определяется той же функцией, что и в hosted-доставке:
        // значения должны быть сопоставимы между режимами измерения
        device_type: detectDeviceType(),

        timestamp_start: current.startedAt,
        timestamp_end: endTimestamp,

        signals: {
            s1: {
                time_in_view_sec: s.viewableTimeMs / 1000,
                max_continuous_view_sec: s.maxContinuousViewableMs / 1000,
                visible_pixels_pct: Math.round(s.maxPercentageInView),
            },
            s2: {
                share_of_screen_avg_pct: averageSharePct(s),
                share_of_screen_max_pct: s.maxSharePct,
            },
            s4: {
                tab_active_time_ms: s.activeTimeMs,
                tab_total_time_ms: s.totalTimeMs,
                tab_switches_count: s.inactiveSwitches,
            },
            s5: {
                clicked: s.clicked,
            },
            s6: {
                play_initiated: s.started,
                quartile_25: s.quartiles.q25,
                quartile_50: s.quartiles.q50,
                quartile_75: s.quartiles.q75,
                completion: s.quartiles.complete,
                pause_initiated: s.paused,
                skipped: s.skipped,
                volume_level: Math.round(s.volume * 100),
                muted_status: s.muted ? 'muted' : 'unmuted',
                audible_time_sec: s.audibleTimeMs / 1000,
                duration_sec: s.durationSec,
                no_output_device: s.noOutputDevice,
            },
        },
    };
}

function finalize(endTimestamp: number): void {
    if (run === null || run.sent) return;
    run.sent = true;

    // Ветка коллекторов отправляет показ сама — полным payload на штатную точку
    // приёма. Дублировать его частичной записью нельзя: получились бы два показа
    if (run.full !== null) {
        run.full.finalize();
        return;
    }

    sendMeasurement(
        buildPartialEndpoint(run.params.collect_endpoint),
        buildPayload(run, endTimestamp),
    );
}

function attachUnloadHandlers(): void {
    const onHide = (): void => finalize(Date.now());

    try {
        window.addEventListener('pagehide', onHide, { once: true });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') onHide();
        });
    } catch {
        // В песочнице часть обработчиков может быть недоступна —
        // финализацию в любом случае выполнит sessionFinish
    }
}

function startMeasurement(client: OmidVerificationClientLike, event: OmidSessionEvent): void {
    const params = parseParams(event.data.verificationParameters);
    if (params === null) return;

    const context = event.data.context;
    const targetWindow = context?.accessMode === 'full' ? getAccessibleTopWindow() : null;
    const level = resolveAccessLevel(context, targetWindow);
    const pageLevel = shouldUsePageCollectors(level);

    const current: MeasurementRun = {
        params,
        accessLevel: level,
        pageCollectorsLoaded: false,
        state: createLimitedState(),
        startedAt: event.timestamp,
        sent: false,
        full: null,
    };

    run = current;

    client.addEventListener('geometryChange', (raw) => {
        if (run !== current) return;
        onGeometryChange(current.state, raw as OmidGeometryChangeEvent);
    });

    client.addEventListener('media', (raw) => {
        if (run !== current) return;
        onMediaEvent(current.state, raw as OmidMediaEvent);
        current.full?.reportMediaEvent(raw as OmidMediaEvent);
    });

    attachUnloadHandlers();

    if (!pageLevel || targetWindow === null) return;

    // Ограниченный сбор уже идёт: если догрузка не состоится или опоздает,
    // показ не теряется, а отправляется с честной отметкой о неполноте
    void loadFullBranch(targetWindow).then((branch) => {
        if (branch === null || current.sent || run !== current) return;

        const session = branch.start({
            params: current.params,
            context: event.data.context ?? {},
            startedAt: current.startedAt,
        });

        if (session === null) return;

        current.full = session;
        current.pageCollectorsLoaded = true;
    }).catch(() => {
        // Отказ полной инициализации не отменяет уже идущий частичный сбор.
    });
}

function bootstrap(): void {
    const client = new OmidVerificationClient() as unknown as OmidVerificationClientLike;

    if (!client.isSupported()) return;

    client.registerSessionObserver((event: OmidSessionEvent) => {
        if (event.type === 'sessionStart') {
            startMeasurement(client, event);
            return;
        }

        if (event.type === 'sessionFinish' || event.type === 'sessionError') {
            finalize(event.timestamp);
        }
    }, CPMIND_OMID_VENDOR);
}

// Ошибка измерения не должна прерывать воспроизведение рекламы
try {
    bootstrap();
} catch {
    // намеренно подавлено
}
