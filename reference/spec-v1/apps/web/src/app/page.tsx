"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, type Goal, type Summary } from "@/lib/api";
import { Card, Label, Shell } from "@/components/Shell";

const GOAL_LABEL: Record<string, { label: string; unit: string; dp: number }> = {
  vitamin_d: { label: "Vitamin D", unit: "ng/mL", dp: 1 }, hdl: { label: "HDL", unit: "mg/dL", dp: 0 }, ldl: { label: "LDL", unit: "mg/dL", dp: 0 },
  body_fat_pct: { label: "Body fat", unit: "%", dp: 1 }, skeletal_muscle_kg: { label: "Skeletal muscle", unit: "kg", dp: 1 },
  waist_hip_ratio: { label: "Waist-hip ratio", unit: "", dp: 2 }, weight_kg: { label: "Weight", unit: "kg", dp: 1 },
};
const dash = (v: number | null, dp = 0) => (v == null ? "—" : v.toFixed(dp));

function Tile({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <Card>
      <Label>{label}</Label>
      <div className="mt-1 text-3xl font-semibold tracking-tight">{value}{unit && value !== "—" && <span className="ml-1 text-sm font-normal text-dim">{unit}</span>}</div>
      {hint && <div className="mt-1 text-[11px] text-mute">{hint}</div>}
    </Card>
  );
}

function GoalBar({ g }: { g: Goal }) {
  const m = GOAL_LABEL[g.metricKey] ?? { label: g.metricKey, unit: "", dp: 1 };
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{m.label}</span>
        <span className="text-dim"><b className="text-text">{dash(g.current, m.dp)}</b> / {g.note ?? (g.direction === "down" ? "≤" : "≥") + g.target} {m.unit}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((g.progress ?? 0) * 100)}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-mute">
        {g.start != null && <>start {g.start}</>}{g.targetDate && <> · by {g.targetDate}</>}{g.asOf && <> · measured {g.asOf}</>}
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["summary"], queryFn: () => api<Summary>("/dashboard/summary") });
  const s = q.data;
  async function logout() { await api("/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }

  return (
    <Shell>
      <header className="mb-5 flex items-start justify-between">
        <div>
          <div className="text-xs font-bold tracking-[0.3em] text-accent">GYM</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{s ? s.day : "—"}</h1>
        </div>
        <button onClick={logout} className="rounded-lg border border-border px-3 py-1.5 text-xs text-dim">Sign out</button>
      </header>

      {q.isError && <p className="mb-4 text-sm text-danger">Couldn’t load the dashboard.</p>}

      <Card className="mb-3">
        <Label>Today</Label>
        {s?.workout ? (
          <>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-semibold tracking-tight">{s.workout.name}</span>
              {s.workout.isPriority && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">Priority</span>}
            </div>
            <div className="text-sm text-dim">{s.workout.exerciseCount} exercises{s.cardio ? ` · then ${s.cardio.durationMin} min treadmill` : ""}</div>
            <Link href="/workout" className="mt-4 block rounded-lg bg-accent py-3.5 text-center font-semibold text-black">Open workout</Link>
          </>
        ) : s?.cardio ? (
          <>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{s.cardio.title}</div>
            <div className="text-sm text-dim">{s.cardio.durationMin} min</div>
            <Link href="/workout" className="mt-4 block rounded-lg bg-accent py-3.5 text-center font-semibold text-black">Open plan</Link>
          </>
        ) : (
          <div className="mt-1 text-2xl font-semibold tracking-tight">{s ? "Rest day" : "—"}</div>
        )}
      </Card>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Tile label="Recovery" value={dash(s?.recovery ?? null)} unit="%" hint="Whoop not connected" />
        <Tile label="Steps" value={dash(s?.steps ?? null)} hint="Whoop / HealthKit not connected" />
      </div>

      <Card>
        <Label>Goals</Label>
        <div className="mt-3 space-y-4">
          {s?.goals.map((g) => <GoalBar key={g.metricKey} g={g} />)}
          {s && !s.goals.length && <p className="text-sm text-dim">No goals yet.</p>}
        </div>
      </Card>
    </Shell>
  );
}
