import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { validateEnv } from "../../config/env.js";
import { prisma } from "../../utils/prisma.js";
import { mqttPublish } from "../../services/mqtt.service.js";
import { waitForStatusJson } from "../../services/mqtt-command-waiter.js";
import { deployOtaPassthrough } from "../../services/ota.service.js";

const env = validateEnv();

export async function systemRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Pump control
  app.post("/api/control/pump", {
    schema: {
      body: z.object({
        deviceId: z.string(),
        action: z.string(),
        duration: z.number().optional()
      }),
    },
  }, async (request, reply) => {
    const { deviceId, action, duration } = request.body;
    const topic = `${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/pump`;
    
    await mqttPublish(topic, JSON.stringify({ action, duration }));
    
    await prisma.actuationLog.create({
      data: {
        device: {
          connectOrCreate: {
            where: { device_id: deviceId },
            create: { device_id: deviceId, status: "ONLINE", firmware_version: "unknown", last_seen: new Date() }
          }
        },
        action: 'pump',
        payload: JSON.stringify(request.body)
      }
    });

    return { ok: true };
  });

  // Mode control
  app.post("/api/control/mode", {
    schema: {
      body: z.object({
        deviceId: z.string(),
        mode: z.enum(['maintenance', 'active'])
      }),
    },
  }, async (request, reply) => {
    const { deviceId, mode } = request.body;
    const topic = `${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/mode`;
    
    await mqttPublish(topic, JSON.stringify({ mode }));
    return { ok: true };
  });

  // Tank geometry / calibration
  app.post("/api/control/tank", {
    schema: {
      body: z.object({
        deviceId: z.string(),
        action: z.string().optional(),
        tankType: z.string().optional(),
        tankDimA: z.number().optional(),
        tankDimB: z.number().optional(),
      }).passthrough(),
    },
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const deviceId = body.deviceId as string;

    await prisma.device.updateMany({
      where: { device_id: deviceId },
      data: {}
    }).catch(() => null);

    if (body.action === "calibrate") {
      const wait = waitForStatusJson(
        deviceId,
        (d) => d.tank === "calibrated" && d.empty_distance_cm != null,
        10_000
      );
      try {
        await mqttPublish(`${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/tank`, JSON.stringify(body));
        const result = await wait;
        return { ok: true, ...result };
      } catch (e: any) {
        app.log.error(`Tank calibrate wait failed: ${e?.message}`);
        return reply.status(504).send({ error: String(e?.message ?? e) });
      }
    }

    await mqttPublish(`${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/tank`, JSON.stringify(body));
    return { ok: true };
  });

  // OTA deployment (passthrough — accepts pre-computed md5/signature from web UI)
  app.post("/api/ota/deploy", {
    schema: {
      body: z.object({
        deviceId: z.string(),
        url: z.string(),
        version: z.string(),
        sha256: z.string().optional(),
        signature: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    try {
      const { deviceId, url, version, sha256, signature } = request.body;
      const result = await deployOtaPassthrough(deviceId, url, version, sha256, signature);
      return { ok: true, result };
    } catch (err: any) {
      app.log.error(`OTA deploy failed: ${err.message}`);
      return reply.status(500).send({ error: String(err.message) });
    }
  });

  // Environment Control (Light, Fan, etc)
  app.post("/api/control/env", {
    schema: {
      body: z.object({
        deviceId: z.string(),
        action: z.enum(['light_on', 'light_off', 'light_auto', 'fan_on', 'fan_off', 'fan_auto'])
      })
    }
  }, async (request) => {
    const { deviceId, action } = request.body;
    await mqttPublish(`${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/env`, JSON.stringify({ action }));
    return { ok: true };
  });

  // Development/Testing Hardware Commands
  app.post("/api/control/test", {
    schema: {
      body: z.object({
        deviceId: z.string(),
        type: z.enum(['sensor', 'relay']),
        id: z.number().optional(), // for relay
        state: z.boolean().optional() // for relay
      })
    }
  }, async (request) => {
    const { deviceId, type, id, state } = request.body;
    await mqttPublish(`${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/test`, JSON.stringify({ type, id, state }));
    return { ok: true };
  });

  // Fetch Diagnostics
  app.get("/api/diagnostics", async () => {
    const alerts = await prisma.systemAlert.findMany({
      where: { resolved: false },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    return alerts;
  });

  // Acknowledge/Resolve Diagnostic
  app.delete("/api/diagnostics/:id", {
    schema: { params: z.object({ id: z.string() }) }
  }, async (request) => {
    await prisma.systemAlert.update({
      where: { id: parseInt(request.params.id) },
      data: { resolved: true }
    });
    return { ok: true };
  });

}
