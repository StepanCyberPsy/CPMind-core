import { FastifyPluginAsync } from 'fastify';
import { DeliveryEventPayloadSchema } from '@cpmind/shared';
import { resolveEmbedScript } from '../services/delivery/embed.js';
import { processDeliveryEvent } from '../services/delivery/events.js';
import { extractPublisherDomain } from '../services/delivery/publisher.js';

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

        const script = await resolveEmbedScript(token, publisherDomain);

        if (script === null) {
            return reply.status(200).send('');
        }

        return reply.status(200).send(script);
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