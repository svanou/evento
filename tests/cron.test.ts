import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("../src/lib/automation", () => ({ runAutomation: vi.fn() }));
import { runAutomation } from "../src/lib/automation";
import { GET } from "../src/app/api/cron/tasks/route";
const secret = "test-only-cron-secret-with-more-than-32-characters";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("rejects missing configuration and unauthorized calls before any task executes", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect(
    (await GET(new NextRequest("https://example.test/api/cron/tasks"))).status,
  ).toBe(503);
  vi.stubEnv("CRON_SECRET", secret);
  for (const authorization of ["", "Bearer wrong-secret"]) {
    expect(
      (
        await GET(
          new NextRequest("https://example.test/api/cron/tasks", {
            headers: { authorization },
          }),
        )
      ).status,
    ).toBe(401);
  }
  expect(runAutomation).not.toHaveBeenCalled();
});
it("executes authenticated Cron and sanitizes failures", async () => {
  vi.stubEnv("CRON_SECRET", secret);
  const request = () =>
    new NextRequest("https://example.test/api/cron/tasks", {
      headers: { authorization: `Bearer ${secret}` },
    });
  vi.mocked(runAutomation).mockResolvedValue({
    busy: false,
    prepared: 1,
    delivered: 0,
  });
  expect((await GET(request())).status).toBe(200);
  expect(runAutomation).toHaveBeenCalledWith({ source: "cron" });
  vi.mocked(runAutomation).mockRejectedValue(
    new Error("private connection info"),
  );
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private connection");
});
