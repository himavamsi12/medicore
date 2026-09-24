/**
 * Transport for the mock service layer.
 *
 * Every service function goes through `mock()`, which simulates a network hop:
 * it waits 200-600 ms and returns a deep clone so UI code can never mutate the
 * in-memory store by accident. To connect a real backend, replace the body of
 * each service function with `api.get(...)` / `api.post(...)` calls below;
 * the function signatures (the contract) stay the same.
 */

export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

const MIN_LATENCY = Number(process.env.NEXT_PUBLIC_MOCK_LATENCY_MIN ?? 200);
const MAX_LATENCY = Number(process.env.NEXT_PUBLIC_MOCK_LATENCY_MAX ?? 600);

export function latency(min = MIN_LATENCY, max = MAX_LATENCY): number {
  return Math.round(min + Math.random() * Math.max(0, max - min));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run a synchronous mock handler as if it were a network request. */
export async function mock<T>(handler: () => T, opts: { min?: number; max?: number } = {}): Promise<T> {
  await sleep(latency(opts.min, opts.max));
  const result = handler();
  return result === undefined ? result : structuredClone(result);
}

/** Throw a 404-style error from inside a mock handler. */
export function notFound(entity: string, id: string): never {
  throw new ServiceError(`${entity} ${id} was not found`, 404);
}

/* ------------------------------------------------------------------ */
/* Real backend client (unused while running on mock data).            */
/* ------------------------------------------------------------------ */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) throw new ServiceError(await res.text(), res.status);
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
