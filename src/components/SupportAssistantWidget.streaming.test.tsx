// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SupportAssistantWidget } from "./SupportAssistantWidget";

const getSessionMock = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn());
const globalFetch = vi.hoisted(() => vi.fn());

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    functions: { invoke: invokeMock },
  },
}));

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (!HTMLElement.prototype.scrollTo) {
    HTMLElement.prototype.scrollTo = function () {
      /* jsdom */
    };
  }
});

function makeSseResponse(events: Array<{ type: "token" | "done" | "error"; data: unknown }>, ok = true) {
  const body = events
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");
  return new Response(body, { status: ok ? 200 : 400, statusText: ok ? "OK" : "Bad" });
}

describe("SupportAssistantWidget streaming (Slice 5)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    getSessionMock.mockReset();
    invokeMock.mockReset();
    globalFetch.mockReset();
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    globalThis.fetch = globalFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    cleanup();
  });

  function openPanel() {
    fireEvent.click(screen.getByTitle("Ana (studio assistant)"));
  }

  it("flag off: uses supabase.functions.invoke, not direct fetch", async () => {
    vi.stubEnv("VITE_OPERATOR_ASSISTANT_STREAMING_V1", "false");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-test");
    invokeMock.mockResolvedValue({ data: { reply: "OK", clientFacingForbidden: true, carryForward: null }, error: null });
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(
      <MemoryRouter>
        <SupportAssistantWidget />
      </MemoryRouter>,
    );
    openPanel();
    const ta = screen.getByPlaceholderText("Ask me anything...");
    fireEvent.change(ta, { target: { value: "Hello" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("operator-studio-assistant", expect.anything()));
    expect(globalFetch).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    alertMock.mockRestore();
  });

  it("flag on: fetch + SSE, in-flight text grows, done replaces with final line", async () => {
    vi.stubEnv("VITE_OPERATOR_ASSISTANT_STREAMING_V1", "true");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-test");
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

    globalFetch.mockImplementation(() =>
      Promise.resolve(
        makeSseResponse([
          { type: "token", data: { delta: "He" } },
          { type: "token", data: { delta: "llo" } },
          {
            type: "done",
            data: {
              reply: "Hello",
              clientFacingForbidden: true,
              carryForward: {
                lastDomain: "projects",
                lastFocusedProjectId: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
                lastFocusedProjectType: "wedding",
                lastMentionedPersonId: null,
                lastThreadId: null,
                lastEntityAmbiguous: false,
                emittedAtEpochMs: 1,
                capturedFocusWeddingId: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
                capturedFocusPersonId: null,
              },
            },
          },
        ]),
      ),
    );

    render(
      <MemoryRouter>
        <SupportAssistantWidget />
      </MemoryRouter>,
    );
    openPanel();
    const ta = screen.getByPlaceholderText("Ask me anything...");
    fireEvent.change(ta, { target: { value: "Q" } });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(screen.getByText("Hello", { exact: true })).toBeDefined();
    });
    expect(globalFetch).toHaveBeenCalled();
    const init = (globalFetch.mock.calls[0] as [string, RequestInit])[1]!;
    expect((init.headers as Record<string, string>)["Accept"]).toBe("text/event-stream");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();

    // Next submit should send carryForward (same thread ref)
    fireEvent.change(ta, { target: { value: "Next" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(globalFetch).toHaveBeenCalledTimes(2));
    const body2 = (globalFetch.mock.calls[1] as [string, RequestInit])[1]!.body as string;
    expect(body2).toContain("carryForward");
    expect(body2).toContain("a0eebc99-9c0b-4ef8-8bb2-111111111111");

    alertMock.mockRestore();
  });

  it("error event: no partial text left, alert", async () => {
    vi.stubEnv("VITE_OPERATOR_ASSISTANT_STREAMING_V1", "true");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-test");
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

    globalFetch.mockImplementation(() =>
      Promise.resolve(
        makeSseResponse([{ type: "token", data: { delta: "x" } }, { type: "error", data: { message: "boom" } }]),
      ),
    );

    render(
      <MemoryRouter>
        <SupportAssistantWidget />
      </MemoryRouter>,
    );
    openPanel();
    const ta = screen.getByPlaceholderText("Ask me anything...");
    fireEvent.change(ta, { target: { value: "Q" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(alertMock).toHaveBeenCalled());
    expect(alertMock.mock.calls[0]![0]).toContain("boom");
    expect(screen.queryByText("x")).toBeNull();

    alertMock.mockRestore();
  });

  it("abort on close: cancels request", async () => {
    vi.stubEnv("VITE_OPERATOR_ASSISTANT_STREAMING_V1", "true");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-test");
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

    let firstSignal: AbortSignal | undefined;
    globalFetch.mockImplementation((_url, init) => {
      firstSignal = (init as RequestInit).signal;
      return new Promise(() => {
        /* never */
      });
    });

    render(
      <MemoryRouter>
        <SupportAssistantWidget />
      </MemoryRouter>,
    );
    openPanel();
    fireEvent.change(screen.getByPlaceholderText("Ask me anything..."), { target: { value: "Q" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(globalFetch).toHaveBeenCalled());
    const sig = firstSignal;
    expect(sig).toBeDefined();
    fireEvent.click(screen.getByTitle("Ana (studio assistant)"));
    expect(sig!.aborted).toBe(true);
    expect(alertMock).not.toHaveBeenCalled();
    alertMock.mockRestore();
  });

  it("new submit while streaming: aborts prior fetch and starts a new one", async () => {
    vi.stubEnv("VITE_OPERATOR_ASSISTANT_STREAMING_V1", "true");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-test");
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

    let firstSignal: AbortSignal | undefined;
    let n = 0;
    globalFetch.mockImplementation((url, init) => {
      n += 1;
      if (n === 1) {
        const signal = (init as RequestInit).signal;
        firstSignal = signal;
        return new Promise<Response>((_resolve, reject) => {
          if (!signal) {
            reject(new Error("expected signal"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return Promise.resolve(
        makeSseResponse([{ type: "done", data: { reply: "Second done", clientFacingForbidden: true, carryForward: null } }]),
      );
    });

    render(
      <MemoryRouter>
        <SupportAssistantWidget />
      </MemoryRouter>,
    );
    openPanel();
    const ta = screen.getByPlaceholderText("Ask me anything...");
    fireEvent.change(ta, { target: { value: "First" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(n).toBe(1));
    expect(firstSignal).toBeDefined();
    expect(firstSignal!.aborted).toBe(false);
    fireEvent.change(ta, { target: { value: "Second" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(firstSignal!.aborted).toBe(true));
    await waitFor(() => expect(n).toBe(2));
    alertMock.mockRestore();
  });
});
