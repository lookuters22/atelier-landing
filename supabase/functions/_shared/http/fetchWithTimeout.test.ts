import { describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, FetchTimeoutError } from "./fetchWithTimeout.ts";

describe("fetchWithTimeout", () => {
  it("throws FetchTimeoutError when the request exceeds timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }),
    );
    try {
      await expect(fetchWithTimeout("https://example.com", { timeoutMs: 8 })).rejects.toThrow(FetchTimeoutError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("propagates caller abort reason (not timeout)", async () => {
    const ac = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init?: RequestInit) => {
        if (!init?.signal) return Promise.reject(new Error("no signal"));
        return new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        });
      }),
    );
    try {
      const p = fetchWithTimeout("https://example.com", { signal: ac.signal, timeoutMs: 60_000 });
      ac.abort("user_cancelled");
      await expect(p).rejects.toBe("user_cancelled");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
