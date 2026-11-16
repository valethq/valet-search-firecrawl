// The only provider-specific test data besides provider.test.ts.
export const ok = { data: { web: [{ title: "T", url: "https://a.test", description: "h" }] } };

export const kernel = {
  searchPath: "/search",
  fetchPath: "/scrape",
  /** Header the API key travels in, and its expected value for the key "kernel-key". */
  authHeader: "authorization",
  authValue: "Bearer kernel-key",
  reply: {
    data: {
      web: [{ title: "Hit", url: "https://example.test/a", description: "found it" }],
      markdown: "page text",
    },
  },
  output: "[1] Hit\nhttps://example.test/a\nfound it",
};
