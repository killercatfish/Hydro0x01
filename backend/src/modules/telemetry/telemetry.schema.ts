import { z } from "zod";

export const telemetrySchema = z.object({
  temperature: z.number().optional(),
  humidity: z.number().optional(),
  waterTemp: z.number().optional(),
  ph: z.number().optional(),
  ec: z.number().optional(),
  waterLevel: z.number().optional(), // Percentage or raw distance
  timestamp: z.number().optional(),
});

export type TelemetryData = z.infer<typeof telemetrySchema>;

export const successSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
});
