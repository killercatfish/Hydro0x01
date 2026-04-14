import fastifyPlugin from "fastify-plugin";
import { writeApi } from "../utils/influx.js";

declare module "fastify" {
  interface FastifyInstance {
    influxWriteApi: typeof writeApi;
  }
}

export const influxPlugin = fastifyPlugin(
  async (fastify) => {
    fastify.decorate("influxWriteApi", writeApi);
    fastify.log.info("InfluxDB (Singleton) initialized");
  },
  { name: "fastify-influx" }
);
