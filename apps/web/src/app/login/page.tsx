"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api("/auth/login", { method: "POST", body: { email, password } }); router.replace("/"); router.refresh(); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8">
        <div className="text-xs font-bold tracking-[0.3em] text-accent">GYM</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-dim">Private. Admin-created accounts only.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full rounded-lg border border-border bg-surface px-4 py-3.5 outline-none focus:border-accent" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded-lg border border-border bg-surface px-4 py-3.5 outline-none focus:border-accent" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="text-sm text-danger">{err}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-accent py-3.5 font-semibold text-black disabled:opacity-50">{busy ? "…" : "Sign in"}</button>
      </form>
    </main>
  );
}
