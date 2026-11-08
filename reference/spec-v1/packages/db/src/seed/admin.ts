import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { createDb, users } from "../index";

// pnpm seed:admin — the ONLY way an account is created. There is no signup route.
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars) in the environment.");
  process.exit(1);
}
const { db, client } = createDb(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
// argon2id (the @node-rs/argon2 default algorithm)
const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
if (existing.length) {
  await db.update(users).set({ passwordHash }).where(eq(users.email, email));
  console.log(`Updated password for ${email}`);
} else {
  await db.insert(users).values({ email, passwordHash, name: process.env.ADMIN_NAME ?? "Madhav", role: "admin", heightCm: 172, sex: "male", timezone: "Asia/Kolkata" });
  console.log(`Created admin ${email}`);
}
await client.end();
