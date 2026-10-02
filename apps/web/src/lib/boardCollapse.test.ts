import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_COLLAPSE_KEY,
  readCollapsedStatuses,
  toggleCollapsedStatus,
  writeCollapsedStatuses,
} from "./boardCollapse";
import type { ApplicationStatus } from "./types";

function makeStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((k: string) => (data.has(k) ? data.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => {
      data.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      data.delete(k);
    }),
  };
}

describe("BOARD_COLLAPSE_KEY", () => {
  it("is versioned key", () => {
    expect(BOARD_COLLAPSE_KEY).toBe("nextrole.board.collapsed.v1");
  });
});

describe("readCollapsedStatuses", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("empty when unset", () => {
    expect(readCollapsedStatuses()).toEqual(new Set());
  });

  it("reads valid statuses", () => {
    vi.stubGlobal(
      "localStorage",
      makeStorage({ [BOARD_COLLAPSE_KEY]: JSON.stringify(["SAVED", "OFFER"]) }),
    );
    expect(readCollapsedStatuses()).toEqual(new Set(["SAVED", "OFFER"]));
  });

  it("drops unknown statuses and non-strings", () => {
    vi.stubGlobal(
      "localStorage",
      makeStorage({
        [BOARD_COLLAPSE_KEY]: JSON.stringify(["SAVED", "NOPE", 3, null, "saved"]),
      }),
    );
    expect(readCollapsedStatuses()).toEqual(new Set(["SAVED"]));
  });

  it("invalid JSON -> empty", () => {
    vi.stubGlobal("localStorage", makeStorage({ [BOARD_COLLAPSE_KEY]: "{oops" }));
    expect(readCollapsedStatuses()).toEqual(new Set());
  });

  it("non-array JSON -> empty", () => {
    for (const raw of ['{"a":1}', '"SAVED"', "42", "null"]) {
      vi.stubGlobal("localStorage", makeStorage({ [BOARD_COLLAPSE_KEY]: raw }));
      expect(readCollapsedStatuses()).toEqual(new Set());
    }
  });

  it("getItem throws -> empty", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(readCollapsedStatuses()).toEqual(new Set());
  });

  it("storage missing -> empty", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", undefined);
    expect(readCollapsedStatuses()).toEqual(new Set());
  });
});

describe("writeCollapsedStatuses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes JSON array under key", () => {
    const storage = makeStorage();
    vi.stubGlobal("localStorage", storage);
    writeCollapsedStatuses(new Set<ApplicationStatus>(["APPLIED", "REJECTED"]));
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = storage.setItem.mock.calls[0]!;
    expect(key).toBe(BOARD_COLLAPSE_KEY);
    expect(JSON.parse(value).sort()).toEqual(["APPLIED", "REJECTED"]);
  });

  it("round-trips", () => {
    vi.stubGlobal("localStorage", makeStorage());
    writeCollapsedStatuses(new Set<ApplicationStatus>(["SAVED"]));
    expect(readCollapsedStatuses()).toEqual(new Set(["SAVED"]));
  });

  it("setItem throws -> swallowed", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => writeCollapsedStatuses(new Set<ApplicationStatus>(["SAVED"]))).not
      .toThrow();
  });
});

describe("toggleCollapsedStatus", () => {
  it("adds when absent", () => {
    const prev = new Set<ApplicationStatus>();
    const next = toggleCollapsedStatus(prev, "SAVED");
    expect(next).toEqual(new Set(["SAVED"]));
    expect(prev.size).toBe(0);
  });

  it("removes when present", () => {
    const prev = new Set<ApplicationStatus>(["SAVED", "OFFER"]);
    const next = toggleCollapsedStatus(prev, "SAVED");
    expect(next).toEqual(new Set(["OFFER"]));
    expect(prev.size).toBe(2);
  });

  it("returns new Set instance", () => {
    const prev = new Set<ApplicationStatus>(["SAVED"]);
    expect(toggleCollapsedStatus(prev, "OFFER")).not.toBe(prev);
  });
});
