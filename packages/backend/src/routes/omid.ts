import type { FastifyPluginAsync } from 'fastify';
import { OmidPartialImpressionSchema } from '@cpmind/shared';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';
import { resolveActiveTagOwner } from '../services/tag/tags.js';
import { loadAdSessionContextRow } from '../services/delivery/impression_context.js';
import { evaluateImpressionContext } from '../services/delivery/impression_context_rules.js';
import { getAdSessionTtlMs } from '../lib/env.js';
import { buildPartialImpressionRecord } from '../services/omid/partial_record.js';
import {
    toCanonicalS1,
    toCanonicalS2,
    toCanonicalS4,
    toCanonicalS5,
    toCanonicalS6,
} from '../services/omid/partial_signals.js';
import {
    normalizeS1,
    normalizeS2,
    normalizeS4,
    normalizeS5,
    normalizeS6,
    resolveS6SegmentKeys,
} from '@cpmind/shared';
import { getActiveWeibullParams } from '../services/configs/weibull_config.js';
import { getActiveS2Params } from '../services/configs/s2_config.js';
import { getActiveS4Config } from '../services/configs/s4_config.js';
import { getActiveS5LogisticParams } from '../services/configs/s5_logistic_config.js';
import { getActiveS6LogisticParams } from '../services/configs/s6_logistic_config.js';

/**
 * Приём показов, измеренных через OMID без доступа к странице издателя.
 *
 * Отдельная точка, а не ветка в /api/collect: основной путь приёма и контракт
 * ImpressionPayload остаются нетронутыми. Проверки контекста доставки —
 * владелец, срок жизни сессии, пригодность режима, доменная политика —
 * те же самые, выполняются той же функцией.
 */
export const omidRoute: FastifyPluginAsync = async (app) => {

    app.post('/collect/omid', async (request, reply) => {
        const parsed = OmidPartialImpressionSchema.safeParse(request.body);

        if (!parsed.success) {
            request.log.warn(
                { errors: parsed.error.flatten() },
                'Rejected OMID impression — validation failed',
            );
            return reply.status(422).send({ errors: parsed.error.flatten() });
        }

        const payload = parsed.data;

        const owner = await resolveActiveTagOwner(payload.tag_uuid);

        if (!owner) {
            request.log.warn(
                { tagUuid: payload.tag_uuid, code: 'UNKNOWN_TAG' },
                'Rejected OMID impression — unknown or inactive tag',
            );
            return reply.status(422).send({ error: 'Unknown or inactive tag' });
        }

        const row = await loadAdSessionContextRow(payload.sid);

        const resolution = evaluateImpressionContext(
            {
                ad_session_id: payload.sid,
                measurement_mode: 'vast_omid',
                placement_uuid: payload.placement_uuid,
                creative_version_uuid: payload.creative_version_uuid,
                tag_constants_version: payload.tag_constants_version,
                creative_type: payload.creative_type,
            },
            row,
            owner.userId,
            Date.now(),
            getAdSessionTtlMs(),
        );

        if (resolution.kind !== 'hosted') {
            const code = resolution.kind === 'rejected' ? resolution.reason : 'NOT_HOSTED';
            request.log.warn(
                { adSessionId: payload.sid, code },
                'Rejected OMID impression — invalid delivery context',
            );
            return reply.status(422).send({ error: 'Invalid delivery context', code });
        }

        const { context } = resolution;

        if (context.contextViolations.length > 0) {
            request.log.warn(
                { adSessionId: payload.sid, violations: context.contextViolations },
                'OMID impression accepted with delivery context violations',
            );
        }

        // Сегменты выводятся теми же правилами, что в /api/collect: значения
        // в кабинете должны считаться по одним и тем же моделям
        const device = payload.device_type;
        const s4Device = device === 'tablet' ? 'mobile' : device;

        const [weibull, s2, s4, s5, s6] = await Promise.all([
            getActiveWeibullParams(`${device}|video`),
            getActiveS2Params(`${device}|video`),
            getActiveS4Config(`${s4Device}_video`),
            getActiveS5LogisticParams(
                device === 'desktop' ? 'desktop' : 'mobile_tablet',
                payload.tag_constants_version,
            ),
            getActiveS6LogisticParams(
                resolveS6SegmentKeys(device, context.format, context.subtype, context.skippable),
                payload.tag_constants_version,
            ),
        ]);

        const record = buildPartialImpressionRecord(payload, context, owner, {
            s1: normalizeS1(toCanonicalS1(payload), weibull.params),
            s2: normalizeS2(toCanonicalS2(payload), s2.params),
            s4: normalizeS4(toCanonicalS4(payload), s4.config),
            s5: normalizeS5(toCanonicalS5(payload), s5.params),
            s6: normalizeS6(toCanonicalS6(payload), s6.params),
            modelVersions: {
                s1: weibull.modelVersion,
                s2: s2.modelVersion,
                s4: s4.modelVersion,
                s5: s5.modelVersion,
                s6: s6.modelVersion,
            },
        });

        try {
            // Идентификатор показа совпадает с идентификатором сессии: на этом
            // пути сегментации нет, и повторная отправка при разрыве сети
            // не должна порождать второй показ
            await db.insert(impressions)
                .values(record)
                .onConflictDoNothing({ target: impressions.impressionId });
        } catch (err) {
            request.log.error({ err, adSessionId: payload.sid }, 'Failed to store OMID impression');
            return reply.status(500).send({ error: 'Internal server error' });
        }

        return reply.status(202).send({ ok: true });
    });
};
