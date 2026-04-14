import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Authentication Guard Hook
 * Decorates verifyAuth on the fastify instance.
 */
export async function authGuard(fastify: FastifyInstance) {
  fastify.decorate('verifyAuth', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized: Invalid or missing token' })
    }
  });

  // Apply to all /api routes except /api/auth/*
  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    
    // Whitelist routes
    if (
      url.startsWith('/api/auth/login') ||
      url.startsWith('/api/auth/setup') ||
      url.startsWith('/health') ||
      !url.startsWith('/api') // allow socket endpoints and whatever else
    ) {
      return;
    }

    // Require auth for everything else under /api
    await (fastify as any).verifyAuth(request, reply);
  });
}
