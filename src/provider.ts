import type { Hit, Provider, Recency } from "./types";

interface WebResult {
  title?: string | null;
  url: string;
  description?: string;
  markdown?: string;
}

interface NewsResult {
  title?: string | null;
  url: string;
  snippet?: string;
  date?: string;
}

interface SearchResponse {
  data?: { web?: WebResult[]; news?: NewsResult[] };
}

interface ScrapeResponse {
  data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string; url?: string } };
}

const CATEGORIES = ["research", "pdf", "developer"];
const TBS: Record<Recency, string> = { day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" };

export const provider: Provider = {
  id: "firecrawl",
  label: "Firecrawl",
  secret: "firecrawl_api_key",
  baseUrl: "https://api.firecrawl.dev/v2",
  keyless: true,
  modes: ["web", "news"],
  defaultMode: "web",
  maxResults: 20,
  searchProps: {
    categories: {
      type: "array",
      items: { type: "string", enum: CATEGORIES },
      description: "Restrict to research sites, PDFs, or the developer index (issues, PRs, READMEs).",
    },
    contents: {
      type: "string",
      enum: ["highlights", "text"],
      description: "Search snippets per result (default), or the full page as markdown (costs more credits).",
    },
  },
  headers: (key) => ({ authorization: `Bearer ${key}` }),
  async search(req, http) {
    const { categories, contents = "highlights" } = req.input;
    const body: Record<string, unknown> = {
      query: req.query,
      limit: req.numResults,
      sources: [req.mode],
    };
    // Firecrawl rejects both domain lists together; the allow-list wins.
    if (req.includeDomains) body.includeDomains = req.includeDomains;
    else if (req.excludeDomains) body.excludeDomains = req.excludeDomains;
    if (req.recency) body.tbs = TBS[req.recency];
    const cats = Array.isArray(categories) ? categories.filter((c) => CATEGORIES.includes(c)) : [];
    if (cats.length > 0) body.categories = cats;
    if (contents === "text") body.scrapeOptions = { formats: ["markdown"], onlyMainContent: true };
    const res = (await http.post("/search", body, req.signal)) as SearchResponse;
    const web: Hit[] = (res.data?.web ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      text: contents === "text" ? r.markdown || r.description : r.description,
    }));
    const news: Hit[] = (res.data?.news ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      date: r.date,
      text: r.snippet,
    }));
    return { hits: [...web, ...news] };
  },
  async fetch(req, http) {
    const hits: Hit[] = [];
    const failed: string[] = [];
    await Promise.all(
      req.urls.map(async (url) => {
        try {
          const res = (await http.post(
            "/scrape",
            { url, formats: ["markdown"], onlyMainContent: true },
            req.signal,
          )) as ScrapeResponse;
          const markdown = res.data?.markdown;
          if (markdown) hits.push({ title: res.data?.metadata?.title, url, text: markdown });
          else failed.push(`${url}: no content`);
        } catch (e) {
          failed.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    );
    const order = (h: Hit) => req.urls.indexOf(h.url);
    return { hits: hits.sort((a, b) => order(a) - order(b)), failed };
  },
};
