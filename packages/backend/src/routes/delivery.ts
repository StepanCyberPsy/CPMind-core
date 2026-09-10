import { FastifyPluginAsync } from 'fastify';
import {
    DeliveryEventPayloadSchema,
    DeliverySessionRequestSchema,
} from '@cpmind/shared';
import { issueAdSession, resolveEmbedScript } from '../services/delivery/embed.js';
import { processDeliveryEvent } from '../services/delivery/events.js';
import { extractPublisherDomain } from '../services/delivery/publisher.js';

const EMBED_SCRIPT_SUFFIX = '.js';

// Контракт встраивания — <script src="/e/{token}.js">: расширение нужно издателю
// и CDN-посредникам, но частью delivery_token не является. Обе формы URL
// резолвятся в один и тот же placement
function normalizeDeliveryToken(rawToken: string): string {
    return rawToken.endsWith(EMBED_SCRIPT_SUFFIX)
        ? rawToken.slice(0, -EMBED_SCRIPT_SUFFIX.length)
        : rawToken;
}

export const deliveryRoute: FastifyPluginAsync = async (app) => {

    // GET /e/:token — embed bundle
    app.get('/e/:token', async (request, reply) => {
        const { token } = request.params as { token: string };
        const publisherDomain = extractPublisherDomain(
            request.headers['referer'] as string | undefined,
        );

        reply
            .header('Content-Type', 'application/javascript; charset=utf-8')
            .header('Cache-Control', 'no-store');

        const script = await resolveEmbedScript(
            normalizeDeliveryToken(token),
            publisherDomain,
        );

        if (script === null) {
            return reply.status(200).send('');
        }

        return reply.status(200).send(script);
    });

    // POST /api/delivery/session — ad session для in-stream привязки
    app.post('/api/delivery/session', async (request, reply) => {
        const parsed = DeliverySessionRequestSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.status(422).send({ errors: parsed.error.flatten() });
        }

        const publisherDomain = extractPublisherDomain(
            request.headers['referer'] as string | undefined,
        );

        const adSessionId = await issueAdSession(
            parsed.data.deliveryToken,
            publisherDomain,
        );

        if (adSessionId === null) {
            return reply.status(404).send({ error: 'Placement not available' });
        }

        return reply.send({ adSessionId });
    });

    // POST /api/delivery/event — SDK lifecycle events
    app.post('/api/delivery/event', async (request, reply) => {
        const parsed = DeliveryEventPayloadSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.status(422).send({ errors: parsed.error.flatten() });
        }

        reply.status(204).send();

        void processDeliveryEvent(parsed.data).catch((err) => {
            app.log.error({ err }, 'Delivery event processing failed');
        });
    });
};