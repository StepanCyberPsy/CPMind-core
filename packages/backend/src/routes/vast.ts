import { FastifyPluginAsync } from 'fastify';
import { VastTrackingRequestSchema } from '@cpmind/shared';
import { resolveVastContext } from '../services/delivery/embed.js';
import { generateVastInLine } from '../services/vast/inline.js';
import { processVastTrackingEvent } from '../services/vast/tracking.js';
import { extractPublisherDomain } from '../services/delivery/publisher.js';

const VAST_EMPTY = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<VAST version="4.3" />',
].join('\n');

export const vastRoute: FastifyPluginAsync = async (app) => {

    // GET /vast/:token — VAST 4.3 InLine XML
    app.get('/vast/:token', async (request, reply) => {
        const { token } = request.params as { token: string };
        const publisherDomain = extractPublisherDomain(
            request.headers['referer'] as string | undefined,
        );

        reply
            .header('Content-Type', 'application/xml; charset=utf-8')
            .header('Cache-Control', 'no-store');

        const context = await resolveVastContext(token, publisherDomain);

        if (context === null) {
            return reply.status(200).send(VAST_EMPTY);
        }

        try {
            const xml = generateVastInLine(context.input);
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
        });

        if (!parsed.success) return;

        void processVastTrackingEvent(parsed.data).catch((err) => {
            app.log.warn({ err }, 'VAST tracking event processing failed');
        });
    });
};