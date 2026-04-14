import fastifyPlugin from "fastify-plugin";
import { Server as SocketIOServer } from "socket.io";

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

export const socketPlugin = fastifyPlugin(
  async (fastify) => {
    const io = new SocketIOServer(fastify.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    fastify.decorate("io", io);

    io.on("connection", (socket) => {
      fastify.log.info(`Socket connected: ${socket.id}`);
      
      socket.on("disconnect", () => {
        fastify.log.info(`Socket disconnected: ${socket.id}`);
      });
    });

    fastify.addHook("onClose", (instance, done) => {
      instance.io.close();
      done();
    });
  },
  { name: "fastify-socket.io" }
);
