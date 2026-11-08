import { SignJWT, jwtVerify } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";

export const COOKIE = "gym_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}
export const signSession = (uid: number) =>
  new SignJWT({ uid }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${MAX_AGE}s`).sign(key());

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}

declare module "fastify" { interface FastifyRequest { uid: number } }

/** Cookie (web) or `Authorization: Bearer` (mobile secure storage). */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
  const token = req.cookies[COOKIE] ?? bearer;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, key());
      if (typeof payload.uid === "number") { req.uid = payload.uid; return; }
    } catch { /* fall through */ }
  }
  return reply.code(401).send({ error: "Not signed in" });
}
