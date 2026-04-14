import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import { socketPlugin } from "./plugins/socket.plugin.js";
import { prismaPlugin } from "./plugins/prisma.plugin.js";
import { influxPlugin } from "./plugins/influx.plugin.js";
import { telemetryRoutes } from "./modules/telemetry/telemetry.route.js";
import { systemRoutes } from "./modules/system/system.route.js";
import { configRoutes } from "./modules/config/config.route.js";
import { sensorsRoutes } from "./modules/sensors/sensors.route.js";
import { authRoutes } from "./modules/auth/auth.route.js";
import { initMqtt } from "./services/mqtt.service.js";
import { setIoInstance } from "./sockets/socket.js";
import { authGuard } from "./hooks/auth.guard.js";
import { validateEnv } from "./config/env.js";

const env = validateEnv();

export const buildApp = async () => {
  const app = Fastify({
    logger: {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  // Register JWT
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET
  });

  // Register core plugins
  await app.register(socketPlugin);
  await app.register(prismaPlugin);
  await app.register(influxPlugin);

  // Initialize standalone port
  await initMqtt();
  app.ready((err) => {
    if (!err) {
      setIoInstance(app.io);
    }
  });

  // Apply Auth Guard and Register modules
  await authGuard(app);
  await app.register(authRoutes);
  await app.register(telemetryRoutes);
  await app.register(systemRoutes);
  await app.register(configRoutes);
  await app.register(sensorsRoutes);

  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  return app;
};
