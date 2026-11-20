import { definePlugin } from "@valethq/sdk";
import { type ProviderConfig, RANK, settings } from "./config";
import { makeHttp } from "./http";
import { provider } from "./provider";
import { fetchTool, searchTool } from "./tools";

export default definePlugin<ProviderConfig>({
  activate(ctx) {
    let current = settings(ctx.config, provider);
    const http = makeHttp({
      provider,
      baseUrl: () => current.baseUrl,
      secret: () => provider.secret,
      key: async () => current.apiKey,
    });
    if (!current.apiKey) ctx.log.info("no API key; running keyless with Firecrawl's per-IP free limits");
    ctx.onConfigChange((next) => {
      current = settings(next, provider);
    });
    const deps = { provider, http, settings: () => current };
    const tools = [searchTool(deps), fetchTool(deps)];
    ctx.scopes.provide("tools", {
      list: ({ role }) => (RANK[role] >= RANK[current.minRole] ? tools : []),
    });
    ctx.log.info(`${provider.id} search ready`, { minRole: current.minRole });
  },
});
