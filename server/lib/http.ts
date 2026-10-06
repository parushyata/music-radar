const USER_AGENT = 'MusicRadar/2.0 (personal self-hosted app)';

export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function fetchText(url: string | URL, opts: FetchOptions = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...opts.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (!res.ok) throw new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, res.status);
  return res.text();
}

export async function fetchJSON<T>(url: string | URL, opts?: FetchOptions): Promise<T> {
  return JSON.parse(await fetchText(url, opts)) as T;
}
