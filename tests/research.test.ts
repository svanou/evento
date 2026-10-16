import { afterEach, expect, it, vi } from "vitest";
import { OpenAIDiscovery } from "../src/lib/openai-discovery";
import { weekendFor, type Source } from "../src/lib/domain";
import { candidate, now, testZone } from "./fixtures";
const source: Source = {
  id: "test-source",
  zone: testZone.id,
  name: "Test",
  url: "https://example.org",
  enabled: 1,
  notes: "",
  created_at: 0,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("utilise Responses, limite les domaines et conserve les preuves retournées sans appel externe", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: "test-response",
          object: "response",
          status: "completed",
          usage: { total_tokens: 123 },
          output: [
            {
              type: "web_search_call",
              id: "search",
              status: "completed",
              action: {
                type: "search",
                query: "test",
                sources: [{ type: "url", url: candidate().sourceUrl }],
              },
            },
            {
              type: "message",
              id: "result",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  annotations: [],
                  text: JSON.stringify({ candidates: [candidate()] }),
                },
              ],
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const provider = new OpenAIDiscovery();
  const results = await provider.discover(
    testZone,
    weekendFor(now, testZone.timezone),
    [source],
    AbortSignal.timeout(1000),
  );
  expect(results).toHaveLength(1);
  expect(provider.tokens).toBe(123);
  expect(provider.toolCalls).toBe(1);
  expect(provider.consulted).toEqual([candidate().sourceUrl]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const calls = fetchMock.mock.calls as unknown as [RequestInfo, RequestInit][];
  expect(String(calls[0][0])).toContain("/responses");
  const body = JSON.parse(String(calls[0][1].body));
  expect(body.tools[0].filters.allowed_domains).toEqual(["example.org"]);
  expect(body.text.format.type).toBe("json_schema");
  expect(body.store).toBe(false);
});
it("n’expose pas un message d’erreur fournisseur pouvant contenir une donnée privée", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "private-request-detail",
              type: "invalid_request_error",
            },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    ),
  );
  await expect(
    new OpenAIDiscovery().discover(
      testZone,
      weekendFor(now, testZone.timezone),
      [source],
      AbortSignal.timeout(1000),
    ),
  ).rejects.toThrow(/^Recherche OpenAI refusée \(HTTP 401\)/);
});
