import type { FastifyInstance } from "fastify";
import { verify, hash } from "@node-rs/argon2";
import { eq, users } from "@gym/db";
import { loginSchema } from "@gym/types";
import { requireAuth, setSessionCookie, signSession, COOKIE } from "../auth";

// Constant-time-ish: always verify against *some* hash so unknown emails cost the same as wrong passwords.
const DUMMY = await hash("dummy-password-for-timing", { memoryCost: 19456, timeCost: 2, parallelism: 1 });

export default async function (app: FastifyInstance) {
  // 5 attempts / 15 min / IP (spec §2). NOTE: there is intentionally NO signup route anywhere.
  app.post("/auth/login", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid input" });
    const [u] = await app.db.select().from(users).where(eq(users.email, body.data.email));
    const ok = await verify(u?.passwordHash ?? DUMMY, body.data.password).catch(() => false);
    if (!u || !ok) return reply.code(401).send({ error: "Wrong email or password" });
    const token = await signSession(u.id);
    setSessionCookie(reply, token);
    const user = { id: u.id, name: u.name, email: u.email, role: u.role };
    return req.headers["x-client"] === "mobile" ? { user, token } : { user };
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (req, reply) => {
    const [u] = await app.db.select().from(users).where(eq(users.id, req.uid));
    if (!u) return reply.code(401).send({ error: "Not signed in" });
    return { id: u.id, name: u.name, email: u.email, role: u.role };
  });
}
