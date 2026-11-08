import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const local = /localhost|127\.0\.0\.1/.test(url);
  // prepare:false is required for Neon's pooled (pgbouncer) endpoint.
  const client = postgres(url, { ssl: local ? false : "require", prepare: false, max: 5, idle_timeout: 20 });
  return { db: drizzle(client, { schema }), client };
}
export type Db = ReturnType<typeof createDb>["db"];
