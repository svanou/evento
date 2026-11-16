import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("../src/lib/security", () => ({
  appUrl: () => "https://evento.example",
  localAdmin: () => false,
  rateLimit: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "../src/lib/security";
import { POST } from "../src/app/api/admin/password-reset/route";
const reset = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
  vi.mocked(createClient).mockReturnValue({
    auth: { resetPasswordForEmail: reset },
  } as unknown as ReturnType<typeof createClient>);
  reset.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
function request(body: unknown, origin = "https://evento.example") {
  return new NextRequest("https://evento.example/api/admin/password-reset", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("rejects cross-origin, invalid and oversized requests without sending email", async () => {
  expect(
    (
      await POST(
        request({ email: "admin@example.com" }, "https://other.example"),
      )
    ).status,
  ).toBe(403);
  expect((await POST(request({ email: "invalid" }))).status).toBe(400);
  expect(
    (
      await POST(
        request({ email: "admin@example.com", extra: "x".repeat(2000) }),
      )
    ).status,
  ).toBe(400);
  expect(reset).not.toHaveBeenCalled();
});
it("sends recovery to the configured site and does not reveal account existence", async () => {
  const success = await POST(request({ email: "Admin@example.com" }));
  expect(success.status).toBe(200);
  expect(reset).toHaveBeenCalledWith("admin@example.com", {
    redirectTo: "https://evento.example/admin/reset-password",
  });
  reset.mockResolvedValue({ error: { code: "user_not_found", status: 400 } });
  const absent = await POST(request({ email: "unknown@example.com" }));
  expect(absent.status).toBe(200);
  expect(await absent.json()).toEqual(await success.json());
});
it("stops rate-limited requests before contacting Supabase", async () => {
  vi.mocked(rateLimit).mockRejectedValueOnce(new Error("Too many attempts"));
  expect((await POST(request({ email: "admin@example.com" }))).status).toBe(
    429,
  );
  expect(reset).not.toHaveBeenCalled();
});
it("reports provider and configuration failures without leaking their details", async () => {
  reset.mockResolvedValue({
    error: { status: 500, message: "private SMTP credentials" },
  });
  const response = await POST(request({ email: "admin@example.com" }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private SMTP");
  reset.mockResolvedValue({ error: { status: 429 } });
  expect((await POST(request({ email: "admin@example.com" }))).status).toBe(
    429,
  );
  reset.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  expect((await POST(request({ email: "admin@example.com" }))).status).toBe(
    503,
  );
  expect(reset).not.toHaveBeenCalled();
});
