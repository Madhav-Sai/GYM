export type ProgressionKind = "plate" | "machine" | "dumbbell" | "assisted" | "bodyweight";

/** Dumbbell ladder for "next dumbbell size". ASSUMPTION: 2 kg steps — edit to match the gym's rack. */
export const DUMBBELL_LADDER = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];

export interface LoggedSet { reps: number; weightKg: number | null; isWarmup: boolean }

export interface ProgressionInput {
  kind: ProgressionKind;
  incrementKg: number | null; // 5 leg press, 2.5 machines/cables; for assisted the assist reduction (positive number)
  targetSets: number;
  targetReps: number;
  currentWeightKg: number | null; // template start weight
  sets: LoggedSet[];
}
export interface ProgressionResult {
  earned: boolean;
  nextWeightKg: number | null;
  reason: string;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function nextDumbbell(current: number, ladder: number[] = DUMBBELL_LADDER): number | null {
  return ladder.find((w) => w > current) ?? null;
}

/**
 * Rule (spec §4): all target sets AND all target reps completed with no failed set -> increment.
 * A set counts only if it is a working set, reps >= target, and the load was at least the target load
 * (for assisted machines: assist no higher than the target). Dropping the weight therefore never earns progression.
 */
export function evaluateProgression(i: ProgressionInput): ProgressionResult {
  if (i.kind === "bodyweight" || i.currentWeightKg == null)
    return { earned: false, nextWeightKg: i.currentWeightKg, reason: "Bodyweight/time exercise — progress manually." };

  const working = i.sets.filter((s) => !s.isWarmup);
  const load = i.currentWeightKg;
  const good = working.filter((s) => {
    if (s.weightKg == null || s.reps < i.targetReps) return false;
    return i.kind === "assisted" ? s.weightKg <= load : s.weightKg >= load;
  });
  const failed = working.length - good.length;

  if (working.length < i.targetSets)
    return { earned: false, nextWeightKg: load, reason: `Only ${working.length}/${i.targetSets} sets logged — repeat.` };
  if (failed > 0 || good.length < i.targetSets)
    return { earned: false, nextWeightKg: load, reason: `${failed} set(s) missed reps or load — repeat.` };

  let next: number | null;
  if (i.kind === "dumbbell") next = nextDumbbell(load);
  else if (i.kind === "assisted") next = Math.max(0, round(load - (i.incrementKg ?? 5)));
  else next = round(load + (i.incrementKg ?? 2.5));

  if (next == null || next === load) return { earned: false, nextWeightKg: load, reason: "No heavier increment available." };
  return { earned: true, nextWeightKg: next, reason: i.kind === "assisted" ? "All sets hit — assist reduced." : "All sets hit — add weight." };
}
