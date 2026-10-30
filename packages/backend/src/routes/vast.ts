import { FastifyPluginAsync } from 'fastify';
import {
    AdSessionIdSchema,
    VastTrackingRequestSchema,
} from '@cpmind/shared';
import { resolveVastContext } from '../services/delivery/embed.js';
import { generateVastInLine } from '../services/vast/inline.js';
import { generateVastWrapper } from '../services/vast/wrapper.js';
import { processVastTrackingEvent } from '../services/vast/tracking.js';
import { extractPublisherDomain } from '../services/delivery/publisher.js';

const VAST_EMPTY = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<VAST version="4.3" />',
].join('\n');

export const vastRoute: FastifyPluginAsync = async (app) => {

    // GET /vast/:token — VAST 4.3 InLine XML. sid — сессия, выданная плееру CPMind:
    // запрос привязывается к ней. Без sid (внешний плеер) создаётся vast_only-сессия
    app.get('/vast/:token', async (request, reply) => {
        const { token } = request.params as { token: string };
        const query = request.query as Record<string, string | undefined>;
        const publisherDomain = extractPublisherDomain(
            request.headers['referer'] as string | undefined,
        );

        reply
            .header('Content-Type', 'application/xml; charset=utf-8')
            .header('Cache-Control', 'no-store');

        const rawSid = query['sid'];
        let requestedAdSessionId: string | null = null;

        if (rawSid !== undefined) {
            const sidParsed = AdSessionIdSchema.safeParse(rawSid);

            if (!sidParsed.success) {
                request.log.warn({ token }, 'VAST request rejected — invalid sid');
                return reply.status(200).send(VAST_EMPTY);
            }

            requestedAdSessionId = sidParsed.data;
        }

        const context = await resolveVastContext(
            token,
            publisherDomain,
            requestedAdSessionId,
        );

        if (context === null) {
            return reply.status(200).send(VAST_EMPTY);
        }

        try {
            const xml = context.plan.kind === 'wrapper'
                ? generateVastWrapper(context.plan.input)
                : generateVastInLine(context.plan.input);
            return reply.status(200).send(xml);
        } catch (err) {
            request.log.error({ err, token }, 'VAST generation failed');
            return reply.status(200).send(VAST_EMPTY);
        }
    });

    // GET /t/vast/:event — tracking pixel, 204 first, fire-and-forget DB write
    app.get('/t/vast/:event', async (request, reply) => {
        reply.status(204).send();

        const { event } = request.params as { event: string };
        const query = request.query as Record<string, string | undefined>;

        const parsed = VastTrackingRequestSchema.safeParse({
            event,
            sid: query['sid'],
            ...(query['code'] !== undefined && { code: query['code'] }),
            ...(query['reason'] !== undefined && { reason: query['reason'] }),
        });

        if (!parsed.success) return;

        // Отказ исполнить скрипт верификации — диагностический сигнал площадки,
        // а не ошибка показа: без него непонятно, почему сигналы не пришли
        if (parsed.data.event === 'verificationNotExecuted') {
            request.log.warn(
                { sid: parsed.data.sid, reason: parsed.data.reason ?? null },
                'OMID verification script not executed by player',
            );
        }

        void processVastTrackingEvent(parsed.data).catch((err) => {
            app.log.warn({ err }, 'VAST tracking event processing failed');
        });
    });
};