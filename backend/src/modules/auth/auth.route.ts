import { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../../utils/prisma.js'
import bcrypt from 'bcryptjs'

export async function authRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>()

  // 1. Setup Admin User (Only allows creation if 0 users exist)
  app.post('/api/auth/setup', {
    schema: {
      body: z.object({
        username: z.string().min(3),
        password: z.string().min(6),
      }),
    },
  }, async (request, reply) => {
    const count = await prisma.user.count()
    if (count > 0) {
      return reply.status(403).send({ error: 'Setup already completed. Please login.' })
    }

    const { username, password } = request.body

    const salt = await bcrypt.genSalt(10)
    const password_hash = await bcrypt.hash(password, salt)

    const user = await prisma.user.create({
      data: {
        username,
        password_hash,
      }
    })

    const token = fastify.jwt.sign({ id: user.id, username: user.username })
    return { token, user: { id: user.id, username: user.username } }
  })

  // 1.5. Check Setup Status
  app.get('/api/auth/setup-status', async (request, reply) => {
    const count = await prisma.user.count()
    return { setupRequired: count === 0 }
  })

  // 2. Login
  app.post('/api/auth/login', {
    schema: {
      body: z.object({
        username: z.string(),
        password: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { username, password } = request.body

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const isMatch = await bcrypt.compare(password, user.password_hash)
    if (!isMatch) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign({ id: user.id, username: user.username })
    return { token, user: { id: user.id, username: user.username } }
  })

  // 3. Get Me
  app.get('/api/auth/me', async (request, reply) => {
    // This route is protected by the global onRequest hook, so request.user exists
    const tokenPayload = request.user as any
    const user = await prisma.user.findUnique({ where: { id: tokenPayload.id } })
    
    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    return { user: { id: user.id, username: user.username } }
  })
}
