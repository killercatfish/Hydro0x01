import fastifyPlugin from "fastify-plugin";
import { prisma } from "../utils/prisma.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

export const prismaPlugin = fastifyPlugin(
  async (fastify) => {
    await prisma.$connect();
    fastify.log.info("Prisma connected to Database (Singleton)");

    fastify.decorate("prisma", prisma);

    fastify.addHook("onClose", async (instance) => {
      await instance.prisma.$disconnect();
    });
  },
  { name: "fastify-prisma" }
);
