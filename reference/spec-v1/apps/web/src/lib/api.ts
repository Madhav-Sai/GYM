export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith("/auth/login") && typeof window !== "undefined") window.location.href = "/login";
  if (!r.ok) throw new ApiError(r.status, data?.error ?? "Request failed");
  return data as T;
}

export interface TemplateExercise {
  templateExerciseId: number; exerciseId: number; name: string; muscleGroup: string; equipment: string; notes: string | null;
  incrementKg: number | null; targetSets: number; targetReps: number; startWeightKg: number | null; restSeconds: number;
  last: { date: string; sets: { reps: number; weightKg: number | null }[] } | null;
}
export interface Template { id: number; name: string; dayLabel: string; isPriority: boolean; exercises: TemplateExercise[] }
export interface CardioStep { fromMin: number; toMin: number; speedKmh: number | [number, number]; inclinePct: number; hr?: string; note?: string }
export interface CardioPlan { key: string; title: string; durationMin: number; steps: CardioStep[]; note?: string }
export interface Today { day: string; rest: boolean; template: Template | null; cardio: CardioPlan | null; openSessionId: number | null; recovery: number | null }
export interface SessionData { id: number; endedAt: string | null; sets: { exerciseId: number; setNumber: number; weightKg: number | null; reps: number }[] }
export interface ProgressionItem { exerciseId: number; name: string; earned: boolean; applied: boolean; fromKg: number | null; toKg: number | null; reason: string }
export interface Goal { metricKey: string; start: number | null; current: number | null; target: number; direction: "up" | "down"; targetDate: string | null; note: string | null; asOf: string | null; progress: number | null }
export interface Summary {
  day: string; rest: boolean; workout: { id: number; name: string; isPriority: boolean; exerciseCount: number } | null;
  cardio: { key: string; title: string; durationMin: number } | null; goals: Goal[];
  recovery: number | null; steps: number | null; sleep: number | null;
}
