import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getDeviceStatus } from "../../services/device-status.service.js";
import { queryTelemetry, queryLatestTelemetry } from "../../services/influx-query.service.js";
import { telemetryCache } from "../../utils/cache.js";
import { prisma } from "../../utils/prisma.js";

export async function telemetryRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // List all devices
  app.get("/api/devices", async (request, reply) => {
    try {
      const devices = await prisma.device.findMany({
        orderBy: { last_seen: "desc" },
      });
      return devices;
    } catch (err) {
      app.log.error(`Failed to fetch devices: ${err}`);
      return reply.status(500).send({ error: "Failed to list devices" });
    }
  });

  // Device status and latest telemetry (Combined View)
  app.get("/api/devices/:deviceId", {
    schema: { params: z.object({ deviceId: z.string() }) },
  }, async (request, reply) => {
    try {
      const { deviceId } = request.params;
      const [deviceStatus, latestTelemetry] = await Promise.all([
        getDeviceStatus(deviceId),
        queryLatestTelemetry(deviceId),
      ]);

      if (!deviceStatus) {
        return reply.status(404).send({ error: "Device not found" });
      }

      const ds: any = deviceStatus;
      const lastStatus = ds.last_status || null;
      const lastPower = ds.last_power || null;

      return {
        ...deviceStatus,
        last_status: lastStatus,
        last_power: lastPower,
        pump: lastStatus?.pump ?? ds.pump ?? null,
        wifi: lastStatus?.wifi ?? ds.wifi ?? null,
        mqtt: lastStatus?.mqtt ?? ds.mqtt ?? null,
        uptime: lastStatus?.uptime ?? ds.uptime ?? null,
        errors: lastStatus?.errors ?? null,
        heap: lastStatus?.heap ?? null,
        telemetry: latestTelemetry,
      };
    } catch (err) {
      app.log.error(`Failed to fetch device info: ${err}`);
      return reply.status(500).send({ error: "Failed to fetch device information" });
    }
  });

  // Device Status Only
  app.get("/api/devices/:deviceId/status", {
    schema: { params: z.object({ deviceId: z.string() }) },
  }, async (request, reply) => {
    try {
      const { deviceId } = request.params;
      const deviceStatus = await getDeviceStatus(deviceId);

      if (!deviceStatus) {
        return reply.status(404).send({ error: "Device not found" });
      }

      const ds: any = deviceStatus;
      const lastStatus = ds.last_status || null;
      const lastPower = ds.last_power || null;

      return {
        ...deviceStatus,
        last_status: lastStatus,
        last_power: lastPower,
        pump: lastStatus?.pump ?? ds.pump ?? null,
        wifi: lastStatus?.wifi ?? ds.wifi ?? null,
        mqtt: lastStatus?.mqtt ?? ds.mqtt ?? null,
        uptime: lastStatus?.uptime ?? ds.uptime ?? null,
        errors: lastStatus?.errors ?? null,
        heap: lastStatus?.heap ?? null,
      };
    } catch (err) {
      app.log.error(`Failed to fetch device status: ${err}`);
      return reply.status(500).send({ error: "Failed to fetch device status" });
    }
  });

  // Telemetry history - Query InfluxDB using Flux
  app.get("/api/devices/:deviceId/telemetry", {
    schema: {
      params: z.object({ deviceId: z.string() }),
      querystring: z.object({
        range: z.string().optional(),
        sensor: z.string().optional(),
        limit: z.string().optional(),
        interval: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    try {
      const { deviceId } = request.params;
      const { range: queryRange, sensor, limit: queryLimit, interval: queryInterval } = request.query;

      const allowedRanges = ['1h', '6h', '12h', '24h', '3d', '7d'];
      const range = allowedRanges.includes(queryRange || '') ? queryRange! : '24h';
      const limit = Math.min(Number(queryLimit) || 200, 500);
      const interval = queryInterval || '1m';

      const cacheKey = `${deviceId}_${range}_${sensor || 'all'}_${limit}_${interval}`;
      const cached = telemetryCache.get(cacheKey);

      if (cached) {
        app.log.debug(`Serving telemetry from cache for ${deviceId}`);
        return cached;
      }

      const data = await queryTelemetry(deviceId, range, sensor, limit, interval);
      const response = {
        deviceId,
        range,
        sensor: sensor || 'all',
        interval,
        limit,
        count: data.length,
        data
      };

      telemetryCache.set(cacheKey, response);
      return response;

    } catch (err) {
      app.log.error(`Failed to fetch telemetry: ${err}`);
      return reply.status(500).send({ error: "Failed to fetch telemetry data" });
    }
  });

}
