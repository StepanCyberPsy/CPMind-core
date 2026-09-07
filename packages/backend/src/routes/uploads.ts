import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    CreateUploadPayloadSchema,
    CompleteUploadPayloadSchema,
} from '@cpmind/shared';
import {
    createUploadSession,
    completeUploadSession,
    getUploadSessionStatus,
} from '../services/uploads/service.js';

export const uploadsRoute: FastifyPluginAsync = async (app) => {
    app.post('/creative-uploads', { preHandler: requireAuth }, async (request, reply) => {
        if (!request.authUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const parsed = CreateUploadPayloadSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(422).send({ errors: parsed.error.flatten() });
        }

        try {
            const result = await createUploadSession(parsed.data, request.authUser.id);
            if (!result) {
                return reply.status(404).send({ error: 'Campaign not found' });
            }
            return reply.status(201).send(result);
        } catch (err) {
            request.log.error({ err }, 'Failed to create upload session');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    app.post(
        '/creative-uploads/:uuid/complete',
        { preHandler: requireAuth },
        async (request, reply) => {
            if (!request.authUser) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { uuid } = request.params as { uuid: string };

            // Payload опционален: для single upload тело пустое,
            // для multipart содержит parts с ETag'ами
            const body = request.body as Record<string, unknown> | null;
            let payload = null;

            if (body && typeof body === 'object' && Array.isArray(body['parts'])) {
                const parsed = CompleteUploadPayloadSchema.safeParse(body);
                if (!parsed.success) {
                    return reply.status(422).send({ errors: parsed.error.flatten() });
                }
                payload = parsed.data;
            }

            try {
                const ok = await completeUploadSession(uuid, request.authUser.id, payload);
                if (!ok) {
                    return reply.status(404).send({ error: 'Upload session not found' });
                }
                return reply.send({ ok: true });
            } catch (err) {
                request.log.error({ err, uuid }, 'Failed to complete upload session');
                return reply.status(500).send({ error: 'Internal server error' });
            }
        },
    );

    app.get(
        '/creative-uploads/:uuid',
        { preHandler: requireAuth },
        async (request, reply) => {
            if (!request.authUser) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { uuid } = request.params as { uuid: string };

            try {
                const result = await getUploadSessionStatus(uuid, request.authUser.id);
                if (!result) {
                    return reply.status(404).send({ error: 'Upload session not found' });
                }
                return reply.send(result);
            } catch (err) {
                request.log.error({ err, uuid }, 'Failed to get upload status');
                return reply.status(500).send({ error: 'Internal server error' });
            }
        },
    );
};