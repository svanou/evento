import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataDir, query } from "./db";

export const demo = () => (process.env.APP_MODE || "demo") === "demo";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export const appUrl = () =>
  (process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

export function secret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32)
    return process.env.SESSION_SECRET;
  if (!demo())
    throw new Error("SESSION_SECRET de 32 caractères minimum requis");
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  const path = join(dataDir(), "session.key");
  try {
    return readFileSync(path, "utf8");
  } catch {
    try {
      writeFileSync(path, randomToken(), { flag: "wx", mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    return readFileSync(path, "utf8");
  }
}
export const privateHash = (value: string) =>
  createHmac("sha256", secret()).update(value).digest("hex");
export function equal(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
export async function newToken(
  profileId: string,
  purpose: "session" | "confirm" | "manage" | "unsubscribe",
  ttlMs: number,
) {
  const raw = randomToken();
  await query(
    "INSERT INTO tokens(hash,profile_id,purpose,expires_at) VALUES($1,$2,$3,$4)",
    [hash(raw), profileId, purpose, Date.now() + ttlMs],
  );
  return raw;
}
export async function tokenOwner(
  raw: string,
  purpose: string,
  consume = false,
): Promise<string | null> {
  if (!raw || raw.length > 128) return null;
  const rows = await query<{ profile_id: string }>(
    `${consume ? "DELETE FROM" : "SELECT profile_id FROM"} tokens WHERE hash=$1 AND purpose=$2 AND expires_at>$3${consume ? " RETURNING profile_id" : ""}`,
    [hash(raw), purpose, Date.now()],
  );
  return rows[0]?.profile_id ?? null;
}
export function signAdmin(id: string): string {
  const payload = Buffer.from(
    JSON.stringify({ id, exp: Date.now() + 8 * 3600_000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
export function adminId(cookie?: string): string | null {
  if (!cookie) return null;
  try {
    const [payload, sig] = cookie.split(".");
    if (
      !equal(
        sig || "",
        createHmac("sha256", secret()).update(payload).digest("base64url"),
      )
    )
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return demo()
      ? data.id === "demo-admin"
        ? data.id
        : null
      : (process.env.ADMIN_USER_IDS || "").split(",").includes(data.id)
        ? data.id
        : null;
  } catch {
    return null;
  }
}
export async function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const rows = await query<{ count: number }>(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,$2)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<$3 THEN 1 ELSE rate_limits.count+1 END,
    expires_at=CASE WHEN rate_limits.expires_at<$3 THEN $2 ELSE rate_limits.expires_at END RETURNING count`,
    [privateHash(key), now + windowMs, now],
  );
  if (rows[0].count > max)
    throw new Error("Trop de tentatives. Réessayez plus tard.");
}
