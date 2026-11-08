"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HR_CEILING } from "@gym/types";
import { api, type CardioPlan, type ProgressionItem, type SessionData, type Today, type TemplateExercise } from "@/lib/api";
import { Card, Label, Shell } from "@/components/Shell";

type Row = { weight: number | null; reps: number; done: boolean };
const key = (ex: number, n: number) => `${ex}:${n}`;
const buzz = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* unsupported (iOS Safari) */ } };
const fmt = (kg: number | null) => (kg == null ? "—" : String(kg));
const isTimed = (e: TemplateExercise) => e.equipment === "bodyweight";

function Stepper({ value, onChange, step, min = 0, suffix }: { value: number | null; onChange: (v: number) => void; step: number; min?: number; suffix?: string }) {
  const v = value ?? 0;
  const set = (n: number) => onChange(Math.max(min, Math.round(n * 100) / 100));
  const b = "h-12 w-11 shrink-0 rounded-lg bg-surface-2 text-xl font-semibold active:bg-border";
  return (
    <div className="flex min-w-0 flex-1 items-center">
      <button aria-label="decrease" className={b} onClick={() => set(v - step)}>−</button>
      <div className="min-w-0 flex-1 text-center text-xl font-semibold">{value == null ? "—" : v}{suffix && <span className="ml-0.5 text-xs font-normal text-dim">{suffix}</span>}</div>
      <button aria-label="increase" className={b} onClick={() => set(v + step)}>+</button>
    </div>
  );
}

function Cardio({ plan }: { plan: CardioPlan }) {
  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between">
        <Label>{plan.title} · {plan.durationMin} min</Label>
      </div>
      <div className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">HR ceiling {HR_CEILING} bpm — never above.</div>
      {plan.note && <p className="mt-2 text-xs text-dim">{plan.note}</p>}
      <div className="mt-3 divide-y divide-border">
        {plan.steps.map((s, i) => (
          <div key={i} className="flex items-baseline justify-between py-2 text-sm">
            <span className="w-16 text-dim">{s.fromMin}–{s.toMin}′</span>
            <span className="flex-1">{Array.isArray(s.speedKmh) ? `${s.speedKmh[0]}→${s.speedKmh[1]}` : s.speedKmh} km/h · {s.inclinePct}%</span>
            <span className="text-right text-xs text-dim">{s.hr ? `HR ${s.hr}` : ""}{s.note ? ` ${s.note}` : ""}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function WorkoutPage() {
  const qc = useQueryClient();
  const today = useQuery({ queryKey: ["today"], queryFn: () => api<Today>("/workouts/today") });
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [extra, setExtra] = useState<Record<number, number>>({});
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<ProgressionItem[] | null>(null);
  const [err, setErr] = useState("");

  const t = today.data?.template ?? null;

  // Resume an unfinished session after reload.
  useEffect(() => {
    const id = today.data?.openSessionId;
    if (!id || sessionId) return;
    setSessionId(id);
    api<SessionData>(`/workouts/sessions/${id}`).then((s) => {
      const r: Record<string, Row> = {}; const ex: Record<number, number> = {};
      for (const x of s.sets) { r[key(x.exerciseId, x.setNumber)] = { weight: x.weightKg, reps: x.reps, done: true }; }
      for (const e of t?.exercises ?? []) {
        const max = Math.max(0, ...s.sets.filter((x) => x.exerciseId === e.exerciseId).map((x) => x.setNumber));
        if (max > e.targetSets) ex[e.exerciseId] = max - e.targetSets;
      }
      setRows(r); setExtra(ex);
    }).catch(() => {});
  }, [today.data?.openSessionId, sessionId, t]);

  useEffect(() => {
    if (!rest) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [rest]);
  const left = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;
  useEffect(() => { if (rest && left === 0) { buzz([200, 100, 200]); setRest(null); } }, [left, rest]);

  const start = useMutation({
    mutationFn: () => api<{ id: number }>("/workouts/sessions", { method: "POST", body: { templateId: t!.id } }),
    onSuccess: (s) => setSessionId(s.id),
    onError: (e) => setErr((e as Error).message),
  });
  const finish = useMutation({
    mutationFn: () => api<{ progressions: ProgressionItem[] }>(`/workouts/sessions/${sessionId}`, { method: "PATCH", body: { end: true } }),
    onSuccess: (r) => { setResult(r.progressions); if (r.progressions.some((p) => p.applied)) buzz([60, 40, 60, 40, 120]); qc.invalidateQueries({ queryKey: ["today"] }); qc.invalidateQueries({ queryKey: ["summary"] }); },
    onError: (e) => setErr((e as Error).message),
  });

  const rowOf = (e: TemplateExercise, n: number): Row =>
    rows[key(e.exerciseId, n)] ?? { weight: isTimed(e) ? null : e.startWeightKg, reps: e.targetReps, done: false };
  const patchRow = (e: TemplateExercise, n: number, p: Partial<Row>) => setRows((r) => ({ ...r, [key(e.exerciseId, n)]: { ...rowOf(e, n), ...p } }));

  async function toggleDone(e: TemplateExercise, n: number) {
    const r = rowOf(e, n); setErr("");
    try {
      if (r.done) {
        await api(`/workouts/sessions/${sessionId}/sets?exerciseId=${e.exerciseId}&setNumber=${n}`, { method: "DELETE" });
        patchRow(e, n, { done: false });
      } else {
        await api(`/workouts/sessions/${sessionId}/sets`, { method: "POST", body: { exerciseId: e.exerciseId, setNumber: n, weightKg: r.weight, reps: r.reps, isWarmup: false } });
        patchRow(e, n, { done: true });
        buzz(40);
        setRest({ until: Date.now() + e.restSeconds * 1000, total: e.restSeconds }); setNow(Date.now());
      }
    } catch (x) { setErr((x as Error).message); }
  }

  const totalDone = useMemo(() => Object.values(rows).filter((r) => r.done).length, [rows]);

  if (today.isLoading) return <Shell><p className="text-dim">Loading…</p></Shell>;
  const d = today.data;

  // ───── finished: progression summary ─────
  if (result) {
    const earned = result.filter((p) => p.applied);
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Session saved</h1>
        <p className="mt-1 text-sm text-dim">{earned.length ? `${earned.length} exercise${earned.length > 1 ? "s" : ""} earned an increase for next time.` : "No increases earned — repeat the same weights."}</p>
        <div className="mt-4 space-y-2">
          {result.map((p) => (
            <Card key={p.exerciseId} className={p.applied ? "border-accent/50" : ""}>
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{p.name}</span>
                {p.applied ? <span className="text-accent">{fmt(p.fromKg)} → <b>{fmt(p.toKg)}</b> kg</span> : <span className="text-dim">{fmt(p.fromKg)} kg</span>}
              </div>
              <div className="mt-0.5 text-xs text-dim">{p.reason}</div>
            </Card>
          ))}
        </div>
        <Link href="/" className="mt-6 block rounded-lg bg-accent py-3.5 text-center font-semibold text-black">Done</Link>
      </Shell>
    );
  }

  // ───── no lifting today ─────
  if (!t) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">{d?.rest ? "Rest day" : d?.cardio ? d.cardio.title : "No workout today"}</h1>
        <p className="mt-1 text-sm text-dim">{d?.day} · {d?.rest ? "Recover. Sleep. Hit protein and water." : "No lifting scheduled."}</p>
        {d?.cardio && <Cardio plan={d.cardio} />}
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t.name}</h1>
          {t.isPriority && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">Priority</span>}
        </div>
        <p className="text-sm text-dim">{d?.day} · recovery {d?.recovery == null ? "—" : `${d.recovery}%`}</p>
      </header>
      {err && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}

      <div className="space-y-3">
        {t.exercises.map((e) => {
          const n = e.targetSets + (extra[e.exerciseId] ?? 0);
          const step = e.equipment === "assisted" ? 5 : (e.incrementKg ?? 2.5);
          return (
            <Card key={e.exerciseId}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/exercise/${e.exerciseId}`} className="font-semibold">{e.name}</Link>
                  <div className="text-xs text-dim">{e.targetSets} × {e.targetReps}{isTimed(e) ? " sec" : ""} · target {isTimed(e) ? "bodyweight" : `${fmt(e.startWeightKg)} kg${e.equipment === "assisted" ? " assist" : ""}`}</div>
                </div>
                <div className="text-right">
                  <Label>Last</Label>
                  <div className="text-sm">{e.last ? e.last.sets.map((s) => `${fmt(s.weightKg)}×${s.reps}`).join("  ") : "—"}</div>
                </div>
              </div>
              {e.notes && <p className="mt-1 text-xs text-warn">{e.notes}</p>}

              {sessionId && (
                <div className="mt-3 space-y-2">
                  {Array.from({ length: n }, (_, i) => i + 1).map((setN) => {
                    const r = rowOf(e, setN);
                    return (
                      <div key={setN} className={`rounded-lg p-2 ${r.done ? "bg-accent/10" : "bg-bg"}`}>
                        <div className="flex items-center gap-2">
                          {!isTimed(e) && <Stepper value={r.weight} step={step} onChange={(v) => patchRow(e, setN, { weight: v, done: false })} suffix="kg" />}
                          <Stepper value={r.reps} step={1} onChange={(v) => patchRow(e, setN, { reps: v, done: false })} suffix={isTimed(e) ? "s" : undefined} />
                        </div>
                        <button onClick={() => toggleDone(e, setN)} className={`mt-2 h-12 w-full rounded-lg text-sm font-bold ${r.done ? "bg-accent text-black" : "border border-border bg-surface-2 text-text"}`}>
                          {r.done ? `✓ Set ${setN} done — tap to undo` : `Complete set ${setN}`}
                        </button>
                      </div>
                    );
                  })}
                  <button onClick={() => setExtra((x) => ({ ...x, [e.exerciseId]: (x[e.exerciseId] ?? 0) + 1 }))} className="text-xs text-dim">+ add set</button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {d?.cardio && <Cardio plan={d.cardio} />}

      {/* keep the last set row clear of the fixed rest timer + action button */}
      <div aria-hidden className="h-52" />

      {/* Primary actions live in the bottom third */}
      <div className="fixed inset-x-0 bottom-14 z-30 mx-auto max-w-md px-4" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
        {rest && (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-info/40 bg-surface px-4 py-3">
            <div><Label>Rest</Label><div className="text-3xl font-semibold">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div></div>
            <div className="flex gap-2">
              <button onClick={() => setRest((r) => (r ? { ...r, until: r.until + 30000 } : r))} className="h-11 rounded-lg bg-surface-2 px-3 text-sm">+30s</button>
              <button onClick={() => setRest(null)} className="h-11 rounded-lg bg-surface-2 px-3 text-sm">Skip</button>
            </div>
          </div>
        )}
        {!sessionId ? (
          <button onClick={() => start.mutate()} disabled={start.isPending} className="h-14 w-full rounded-xl bg-accent text-lg font-bold text-black disabled:opacity-50">Start workout</button>
        ) : (
          <button onClick={() => finish.mutate()} disabled={finish.isPending || totalDone === 0} className="h-14 w-full rounded-xl bg-accent text-lg font-bold text-black disabled:opacity-40">
            {finish.isPending ? "Saving…" : `Finish workout · ${totalDone} sets`}
          </button>
        )}
      </div>
    </Shell>
  );
}
