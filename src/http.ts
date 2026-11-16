import type { Http, Provider } from "./types";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const HINTS: Record<number, string> = {
  401: "the API key was rejected",
  402: "the account is out of credits",
  403: "the API key is not allowed to do that",
  429: "rate limited, try again shortly",
};

function errorText(body: string): string {
  try {
    const { error } = JSON.parse(body) as { error?: unknown };
    if (typeof error === "string") return error.slice(0, 300);
  } catch {}
  return body.slice(0, 300);
}

export interface HttpOptions {
  provider: Pick<Provider, "label" | "headers" | "keyless">;
  baseUrl(): string;
  secret(): string;
  key(): Promise<string | undefined>;
  fetch?: Fetch;
}

export function makeHttp(o: HttpOptions): Http {
  const doFetch: Fetch = o.fetch ?? ((input, init) => fetch(input, init));
  const { label } = o.provider;
  return {
    async post(path, body, signal) {
      const key = (await o.key())?.trim() || undefined;
      if (!key && !o.provider.keyless) {
        const name = o.secret();
        throw new ProviderError(
          `no ${label} API key: put it in ~/.valet/secrets/${name} (mode 0600) or set ${name.toUpperCase()}`,
        );
      }
      let res: Response;
      try {
        res = await doFetch(`${o.baseUrl()}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(key && o.provider.headers(key)) },
          body: JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw new ProviderError("request timed out or was cancelled");
        throw new ProviderError(`could not reach ${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!res.ok) {
        const detail = errorText(await res.text().catch(() => ""));
        const hint =
          !key && res.status === 429
            ? `rate limited; keyless use is capped per IP per day, add an API key at ~/.valet/secrets/${o.secret()} for more`
            : (HINTS[res.status] ?? "request failed");
        throw new ProviderError(`${label} ${res.status}: ${hint}${detail ? ` (${detail})` : ""}`, res.status);
      }
      return res.json();
    },
  };
}
