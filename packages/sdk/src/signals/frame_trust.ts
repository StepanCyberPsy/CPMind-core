// Взаимодействия внутри iframe креатива, о которых сообщает creative-bridge
export type FrameInteractionKind =
    | 'activity'
    | 'click'
    | 'tap'
    | 'swipe'
    | 'zoom';

// direct — подтверждено наблюдением хоста, window — принято в окне вовлечённости
// после доверенного события, rejected — не подтверждено, в Score не участвует
export type FrameInteractionTrust =
    | 'direct'
    | 'window'
    | 'rejected';

// Состояние, наблюдаемое страницей паблишера. userActivationActive = null — API не поддерживается
export interface FrameTrustObservation {
    pointerOver: boolean;
    frameFocused: boolean;
    frameVisible: boolean;
    documentVisible: boolean;
    hoverCapable: boolean;
    userActivationActive: boolean | null;
    msSinceLastDirect: number | null;
}

export const FRAME_ENGAGEMENT_WINDOW_MS = 30_000;

const ACTIVATION_KINDS: ReadonlySet<FrameInteractionKind> = new Set([
    'click',
    'tap',
]);

/**
 * Классифицирует событие моста креатива. Скрипты креатива исполняются в одном окне
 * с мостом и могут подделать любое сообщение, поэтому событие принимается только
 * при подтверждении со стороны страницы: курсор над iframe, фокус iframe или активация
 * пользователя, которую браузер передаёт из iframe всем родительским фреймам.
 * Окно вовлечённости применяется только к сенсорному вводу и не продлевается
 * событиями, принятыми через это окно.
 */
export function classifyFrameInteraction(
    kind: FrameInteractionKind,
    observation: FrameTrustObservation,
): FrameInteractionTrust {
    if (!observation.documentVisible) return 'rejected';

    if (ACTIVATION_KINDS.has(kind)) {
        if (observation.userActivationActive === false) return 'rejected';

        if (observation.hoverCapable) {
            return observation.pointerOver || observation.frameFocused
                ? 'direct'
                : 'rejected';
        }

        if (!observation.frameVisible) return 'rejected';

        return observation.userActivationActive === true || observation.frameFocused
            ? 'direct'
            : 'rejected';
    }

    if (observation.hoverCapable) {
        return observation.pointerOver ? 'direct' : 'rejected';
    }

    const withinEngagementWindow =
        observation.frameVisible &&
        observation.msSinceLastDirect !== null &&
        observation.msSinceLastDirect <= FRAME_ENGAGEMENT_WINDOW_MS;

    return withinEngagementWindow ? 'window' : 'rejected';
}