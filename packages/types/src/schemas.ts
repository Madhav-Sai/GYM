import { z } from "zod";

export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
export const startSessionSchema = z.object({ templateId: z.number().int().positive().nullable().optional(), name: z.string().trim().max(80).optional() });
export const setLogSchema = z.object({
  exerciseId: z.number().int().positive(),
  setNumber: z.number().int().min(1).max(50),
  weightKg: z.number().min(0).max(1000).nullable(),
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().min(1).max(10).nullable().optional(),
  isWarmup: z.boolean().default(false),
});
export const patchSessionSchema = z.object({
  end: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  perceivedEffort: z.number().int().min(1).max(10).optional(),
});
export type SetLogInput = z.infer<typeof setLogSchema>;
