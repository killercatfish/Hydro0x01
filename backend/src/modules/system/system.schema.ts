import { z } from "zod";

export const pumpControlSchema = z.object({
  state: z.boolean(),
});

export const dosingControlSchema = z.object({
  type: z.enum(["ph_up", "ph_down", "nutrients_a", "nutrients_b"]),
  amount_ml: z.number().min(1).max(500),
});

export const relayControlSchema = z.object({
  device: z.enum(["light", "fan", "aux_pump"]),
  state: z.boolean(),
});

export const systemModeSchema = z.object({
  mode: z.enum(["auto", "manual"]),
});
