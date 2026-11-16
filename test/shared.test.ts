import { expect, test } from "bun:test";
import { provider } from "../src/provider";
import { searchTool } from "../src/tools";
import { ok } from "./fixture";
import { call, deps, fakeApi, textOf } from "./helpers";

test("HTTP failures become readable tool errors", async () => {
  for (const [status, hint] of [
    [401, "rejected"],
    [402, "credits"],
    [429, "rate limited"],
  ] as const) {
    const { client } = fakeApi(() => new Response("nope", { status }));
    const r = await searchTool(deps(client)).invoke({ query: "q" }, call());
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain(`${provider.label} ${status}`);
    expect(textOf(r)).toContain(hint);
  }
});

test("without a key the tools go keyless: no auth header, and a 429 explains the per-IP cap", async () => {
  const { client, seen } = fakeApi(() => ok, null);
  const r = await searchTool(deps(client)).invoke({ query: "q" }, call());
  expect(r.isError).toBeUndefined();
  expect(seen).toHaveLength(1);
  expect(seen[0]?.headers.has("authorization")).toBe(false);
  const limited = fakeApi(() => new Response("{}", { status: 429 }), null);
  const e = await searchTool(deps(limited.client)).invoke({ query: "q" }, call());
  expect(e.isError).toBe(true);
  expect(textOf(e)).toContain("keyless use is capped per IP");
  expect(textOf(e)).toContain(`~/.valet/secrets/${provider.secret}`);
});

test("a blank key file counts as no key", async () => {
  const { client, seen } = fakeApi(() => ok, "  \n");
  await searchTool(deps(client)).invoke({ query: "q" }, call());
  expect(seen[0]?.headers.has("authorization")).toBe(false);
});

test("roles below minRole are refused", async () => {
  const { client, seen } = fakeApi(() => ok);
  const t = searchTool(deps(client));
  expect(t.minRole).toBe("trusted");
  expect((await t.invoke({ query: "q" }, call("guest"))).isError).toBe(true);
  expect(seen).toHaveLength(0);
  expect((await t.invoke({ query: "q" }, call("owner"))).isError).toBeUndefined();
  const strict = searchTool(deps(client, { minRole: "owner" }));
  expect((await strict.invoke({ query: "q" }, call("trusted"))).isError).toBe(true);
});
