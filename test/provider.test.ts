import { expect, test } from "bun:test";
import { fetchTool, searchTool } from "../src/tools";
import { call, deps, fakeApi, textOf } from "./helpers";

const hit = {
  title: "Bun 1.4",
  url: "https://bun.sh/blog",
  description: "fast runtime",
};

test("web_search_firecrawl sends a bearer key, maps options to Firecrawl's body and formats results", async () => {
  const { client, seen } = fakeApi(() => ({ data: { web: [hit] } }));
  const r = await searchTool(deps(client)).invoke(
    {
      query: "bun release",
      numResults: 3,
      includeDomains: ["bun.sh"],
      excludeDomains: ["x.com"],
      recency: "week",
      categories: ["research", "bogus"],
    },
    call(),
  );
  expect(r.isError).toBeUndefined();
  expect(textOf(r)).toBe("[1] Bun 1.4\nhttps://bun.sh/blog\nfast runtime");
  const [s] = seen;
  expect(s?.path).toBe("/search");
  expect(s?.headers.get("authorization")).toBe("Bearer k-123");
  expect(s?.body).toEqual({
    query: "bun release",
    limit: 3,
    sources: ["web"],
    includeDomains: ["bun.sh"],
    tbs: "qdr:w",
    categories: ["research"],
  });
});

test("web_search_firecrawl uses excludeDomains alone, asks for markdown on demand and clamps the limit", async () => {
  const { client, seen } = fakeApi(() => ({
    data: { web: [{ url: "https://a.b", description: "snippet", markdown: "full page" }] },
  }));
  const text = await searchTool(deps(client)).invoke(
    { query: "x", numResults: 99, contents: "text", excludeDomains: ["x.com"] },
    call(),
  );
  expect(textOf(text)).toBe("[1] https://a.b\nhttps://a.b\nfull page");
  expect(seen[0]?.body).toMatchObject({
    limit: 20,
    excludeDomains: ["x.com"],
    scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
  });
  expect(seen[0]?.body.includeDomains).toBeUndefined();
  expect(seen[0]?.body.categories).toBeUndefined();
  expect(seen[0]?.body.tbs).toBeUndefined();
});

test("news mode searches the news source and keeps Firecrawl's relative dates", async () => {
  const { client, seen } = fakeApi(() => ({
    data: {
      news: [
        { title: "N", url: "https://n.test", snippet: "story", date: "3 weeks ago" },
        { title: "Dated", url: "https://d.test", snippet: "s", date: "2026-10-01T12:00:00Z" },
      ],
    },
  }));
  const r = await searchTool(deps(client, { mode: "news" })).invoke({ query: "q" }, call());
  expect(seen[0]?.body.sources).toEqual(["news"]);
  expect(textOf(r)).toBe(
    "[1] N\nhttps://n.test\n3 weeks ago\nstory\n\n[2] Dated\nhttps://d.test\n2026-10-01\ns",
  );
});

test("web_search_firecrawl truncates long excerpts and survives an empty reply", async () => {
  const { client } = fakeApi(() => ({
    data: { web: [{ url: "https://a.b", description: "x".repeat(5000) }] },
  }));
  const out = textOf(await searchTool(deps(client)).invoke({ query: "q", maxCharacters: 300 }, call()));
  expect(out.endsWith("...")).toBe(true);
  expect(out.length).toBeLessThan(400);
  const empty = fakeApi(() => ({}));
  expect(textOf(await searchTool(deps(empty.client)).invoke({ query: "q" }, call()))).toBe("No results.");
});

test("web_fetch_firecrawl scrapes each URL, keeps the input order and lists failures", async () => {
  const { client, seen } = fakeApi((path) => ({
    path,
    data: { markdown: "hello", metadata: { title: "A" } },
  }));
  const mixed = fakeApi(() => new Response('{"error":"blocked"}', { status: 500 }));
  const ok = await fetchTool(deps(client)).invoke({ urls: ["https://a.test", "https://b.test"] }, call());
  expect(textOf(ok)).toBe("[1] A\nhttps://a.test\nhello\n\n[2] A\nhttps://b.test\nhello");
  expect(seen.map((s) => s.path)).toEqual(["/scrape", "/scrape"]);
  expect(seen[0]?.body).toEqual({ url: "https://a.test", formats: ["markdown"], onlyMainContent: true });
  const r = await fetchTool(deps(mixed.client)).invoke({ urls: ["https://b.test"] }, call());
  expect(r.isError).toBe(true);
  expect(textOf(r)).toContain("https://b.test: Firecrawl 500: request failed (blocked)");
  expect((await fetchTool(deps(client)).invoke({ urls: [] }, call())).isError).toBe(true);
});

test("web_fetch_firecrawl reports a page with no markdown as a failure but returns the other pages", async () => {
  const { client } = fakeApi(() => ({ data: {} }));
  const r = await fetchTool(deps(client)).invoke({ urls: ["https://c.test"] }, call());
  expect(r.isError).toBe(true);
  expect(textOf(r)).toContain("https://c.test: no content");
});
