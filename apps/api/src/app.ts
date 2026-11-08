import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { createDb, sql, type Db } from "@gym/db";
import authRoutes from "./routes/auth";
import workoutRoutes from "./routes/workouts";
import dashboardRoutes from "./routes/dashboard";

declare module "fastify" { interface FastifyInstance { db: Db } }

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" && { level: "info" }, trustProxy: true });
  const { db, client } = createDb();
  app.decorate("db", db);
  app.addHook("onClose", async () => { await client.end({ timeout: 2 }); });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.get("/health", async (_req, reply) => {
    try { await db.execute(sql`select 1`); return { ok: true }; } catch { return reply.code(503).send({ ok: false }); }
  });

  await app.register(authRoutes);
  await app.register(workoutRoutes);
  await app.register(dashboardRoutes);

  // Anything else — including /auth/register, /signup, /register — is a plain 404. No signup exists.
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "Not found" }));
  app.setErrorHandler((e, _req, reply) => {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode === 429) return reply.code(429).send({ error: "Too many attempts. Try again later." });
    app.log.error(err);
    const sc = err.statusCode;
    return reply.code(sc && sc < 500 ? sc : 500).send({ error: sc && sc < 500 ? err.message : "Server error" });
  });
  return app;
}
