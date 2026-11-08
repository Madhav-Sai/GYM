import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateProgression, nextDumbbell } from "./progression";
import { istWeekStart, istDayLabel } from "./time";

const ok = (reps: number, w: number, warm = false) => ({ reps, weightKg: w, isWarmup: warm });
const base = { kind: "machine" as const, incrementKg: 2.5, targetSets: 3, targetReps: 10, currentWeightKg: 25 };

test("all sets hit -> +2.5", () => {
  const r = evaluateProgression({ ...base, sets: [ok(10, 25), ok(10, 25), ok(11, 25)] });
  assert.equal(r.earned, true); assert.equal(r.nextWeightKg, 27.5);
});
test("one failed set -> repeat", () => {
  const r = evaluateProgression({ ...base, sets: [ok(10, 25), ok(9, 25), ok(10, 25)] });
  assert.equal(r.earned, false); assert.equal(r.nextWeightKg, 25);
});
test("too few sets -> repeat", () => {
  assert.equal(evaluateProgression({ ...base, sets: [ok(10, 25), ok(10, 25)] }).earned, false);
});
test("warmups ignored", () => {
  const r = evaluateProgression({ ...base, sets: [ok(5, 10, true), ok(10, 25), ok(10, 25), ok(10, 25)] });
  assert.equal(r.earned, true);
});
test("dropping the load never earns progression", () => {
  assert.equal(evaluateProgression({ ...base, sets: [ok(10, 20), ok(10, 20), ok(10, 20)] }).earned, false);
});
test("leg press +5", () => {
  const r = evaluateProgression({ ...base, incrementKg: 5, currentWeightKg: 30, targetReps: 12, sets: [ok(12, 30), ok(12, 30), ok(12, 30)] });
  assert.equal(r.nextWeightKg, 35);
});
test("assisted pullup: assist goes DOWN by 5", () => {
  const r = evaluateProgression({ kind: "assisted", incrementKg: 5, targetSets: 3, targetReps: 8, currentWeightKg: 65, sets: [ok(8, 65), ok(8, 65), ok(8, 65)] });
  assert.equal(r.earned, true); assert.equal(r.nextWeightKg, 60);
});
test("assisted: using MORE assist than target does not count", () => {
  const r = evaluateProgression({ kind: "assisted", incrementKg: 5, targetSets: 3, targetReps: 8, currentWeightKg: 65, sets: [ok(8, 70), ok(8, 70), ok(8, 70)] });
  assert.equal(r.earned, false);
});
test("goblet squat: next dumbbell", () => {
  const r = evaluateProgression({ kind: "dumbbell", incrementKg: null, targetSets: 3, targetReps: 10, currentWeightKg: 8, sets: [ok(10, 8), ok(10, 8), ok(10, 8)] });
  assert.equal(r.nextWeightKg, 10); assert.equal(nextDumbbell(40), null);
});
test("bodyweight never progresses automatically", () => {
  assert.equal(evaluateProgression({ kind: "bodyweight", incrementKg: null, targetSets: 3, targetReps: 30, currentWeightKg: null, sets: [ok(30, 0)] }).earned, false);
});
test("IST week starts Monday; IST date rolls over at 18:30 UTC", () => {
  assert.equal(istWeekStart(new Date("2026-11-08T10:00:00Z")), "2026-11-02"); // Sunday -> Monday 2 Nov
  assert.equal(istDayLabel(new Date("2026-11-08T19:00:00Z")), "Mon"); // 00:30 IST Monday
});
