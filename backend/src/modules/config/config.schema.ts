import { z } from "zod";

export const configSchema = z.object({
  targetPh: z.number().optional(),
  targetEc: z.number().optional(),
  lightCycleOn: z.string().optional(), // HH:MM
  lightCycleOff: z.string().optional(), // HH:MM
  pumpCycleOnDuration: z.number().optional(), // seconds
  pumpCycleOffDuration: z.number().optional(), // seconds
});

export type ConfigData = z.infer<typeof configSchema>;
