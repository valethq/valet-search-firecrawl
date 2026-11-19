import { definePlugin } from "@valethq/sdk";
import { type ProviderConfig, RANK, settings } from "./config";
import { makeHttp } from "./http";
import { settingsPanel } from "./panel";
import { provider } from "./provider";
import { fetchTool, searchTool } from "./tools";

export default definePlugin<ProviderConfig>({
  async activate(ctx) {
    let current = settings(ctx.config, provider);
    const http = makeHttp({
      provider,
      baseUrl: () => current.baseUrl,
      secret: () => current.secret,
      key: () => ctx.secrets.get(current.secret),
    });
    if (!(await ctx.secrets.get(current.secret))) {
      ctx.log.info("no API key; running keyless with Firecrawl's per-IP free limits", {
        secret: current.secret,
      });
    }
    ctx.onConfigChange((next) => {
      current = settings(next, provider);
    });
    const deps = { provider, http, settings: () => current };
    const tools = [searchTool(deps), fetchTool(deps)];
    ctx.scopes.provide("tools", {
      list: ({ role }) => (RANK[role] >= RANK[current.minRole] ? tools : []),
    });
    ctx.scopes.define({ name: "settings", version: 1, cardinality: "many" });
    ctx.scopes.provide(
      "settings",
      settingsPanel({
        provider,
        current: () => current,
        hasKey: async () => Boolean(await ctx.secrets.get(current.secret)),
      }),
      { key: ctx.plugin.id },
    );
    ctx.log.info(`${provider.id} search ready`, { minRole: current.minRole });
  },
});
