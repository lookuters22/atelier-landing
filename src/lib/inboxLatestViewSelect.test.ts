import { describe, expect, it } from "vitest";
import { isMissingLatestProviderMessageIdPostgresError } from "./inboxLatestViewSelect";

describe("isMissingLatestProviderMessageIdPostgresError", () => {
  it("returns true for 42703 on latest_provider_message_id", () => {
    expect(
      isMissingLatestProviderMessageIdPostgresError({
        code: "42703",
        message: 'column v_threads_inbox_latest_message.latest_provider_message_id does not exist',
      }),
    ).toBe(true);
  });

  it("returns false for 42703 on another column", () => {
    expect(
      isMissingLatestProviderMessageIdPostgresError({
        code: "42703",
        message: "column v_threads_inbox_latest_message.some_other_col does not exist",
      }),
    ).toBe(false);
  });

  it("returns false for unrelated errors", () => {
    expect(
      isMissingLatestProviderMessageIdPostgresError({
        code: "PGRST301",
        message: "JWT expired",
      }),
    ).toBe(false);
  });
});
