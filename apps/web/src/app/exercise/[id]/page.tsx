"use client";
import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { Card, Label, Shell } from "@/components/Shell";

interface Hist { exercise: { name: string; equipment: string } | null; history: { date: string; topWeightKg: number | null; volume: number; sets: { reps: number; weightKg: number | null }[] }[] }

export default function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({ queryKey: ["hist", id], queryFn: () => api<Hist>(`/exercises/${id}/history`) });
  const h = q.data;
  const data = (h?.history ?? []).map((x) => ({ date: new Date(x.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }), kg: x.topWeightKg }));
  return (
    <Shell>
      <Link href="/workout" className="text-sm text-dim">← Workout</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{h?.exercise?.name ?? "—"}</h1>
      <Card className="mt-4">
        <Label>Top set weight{h?.exercise?.equipment === "assisted" ? " (assist — lower is better)" : ""}</Label>
        {data.length < 2 ? (
          <p className="mt-3 text-sm text-dim">{data.length ? "One session logged — a trend needs two." : "No sessions logged yet."}</p>
        ) : (
          <div className="mt-3 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" stroke="#52525b" fontSize={11} tickLine={false} />
                <YAxis stroke="#52525b" fontSize={11} tickLine={false} width={32} domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip contentStyle={{ background: "#141416", border: "1px solid #27272a", borderRadius: 8 }} />
                <Line type="monotone" dataKey="kg" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <div className="mt-3 space-y-2">
        {[...(h?.history ?? [])].reverse().map((x, i) => (
          <Card key={i}>
            <div className="flex justify-between text-sm"><span>{new Date(x.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</span><span className="text-dim">vol {Math.round(x.volume)}</span></div>
            <div className="mt-0.5 text-sm text-dim">{x.sets.map((s) => `${s.weightKg ?? "—"}×${s.reps}`).join("  ")}</div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
