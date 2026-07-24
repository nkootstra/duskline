import { describe, expect, it } from "vitest";
import {
  filtersFromSearch,
  parseDashboardSearch,
  searchFromFilters,
} from "../src/lib/dashboard-search";
import { deletionCountdownLabel } from "../src/lib/lifecycle-table";

describe("deletion labels", () => {
  it("uses concise countdown labels", () => {
    expect(deletionCountdownLabel(0)).toBe("Today");
    expect(deletionCountdownLabel(1)).toBe("1 day left");
    expect(deletionCountdownLabel(4)).toBe("4 days left");
    expect(deletionCountdownLabel(-1)).toBe("Deleted");
    expect(deletionCountdownLabel(-4)).toBe("Deleted");
  });
});

describe("dashboard search", () => {
  it("accepts only contract providers and positive pages", () => {
    expect(
      parseDashboardSearch({ provider: "openai", q: "gpt", page: 2 }),
    ).toEqual({ provider: "openai", q: "gpt", page: 2 });
    expect(
      parseDashboardSearch({ provider: "invalid", q: "", page: -1 }),
    ).toEqual({});
  });

  it("round-trips normalized filters without empty query parameters", () => {
    expect(
      searchFromFilters(
        filtersFromSearch({ provider: "aws_bedrock", page: 3 }),
      ),
    ).toEqual({ provider: "aws_bedrock", page: 3 });
  });
});
