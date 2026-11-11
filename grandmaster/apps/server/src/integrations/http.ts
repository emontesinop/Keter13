export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Serial, polite HTTP client: one request at a time, honours 429 with a single delayed retry. */
export class PoliteClient {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private fetchImpl: FetchLike = fetch, private headers: Record<string, string> = {}, private backoffMs = 60000, private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {}
  request(url: string, init: RequestInit = {}): Promise<Response> {
    const run = async () => {
      const opts = { ...init, headers: { ...this.headers, ...(init.headers as Record<string, string> | undefined) } };
      let res = await this.fetchImpl(url, opts);
      if (res.status === 429) { await this.sleep(this.backoffMs); res = await this.fetchImpl(url, opts); }
      return res;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }
}

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }
