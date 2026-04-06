import { describe, expect, it } from "vitest";
import {
  ACTION_KEY_STUDIO_SETTINGS_CONTRACT,
  buildStudioSettingsContractPlaybookRule,
  hasMeaningfulStudioSettingsContract,
  studioSettingsContractInstructionV1,
} from "./backfillPhotographerSettingsToPlaybook.ts";

describe("backfillPhotographerSettingsToPlaybook", () => {
  const pid = "00000000-0000-0000-0000-000000000001";

  it("returns null when contract is empty", () => {
    expect(buildStudioSettingsContractPlaybookRule(pid, {})).toBeNull();
    expect(hasMeaningfulStudioSettingsContract({})).toBe(false);
  });

  it("ignores whitespace-only strings", () => {
    expect(
      hasMeaningfulStudioSettingsContract({
        studio_name: "   ",
      }),
    ).toBe(false);
  });

  it("builds instruction JSON from present contract fields", () => {
    const contract = {
      studio_name: "Northlight",
      timezone: "Europe/London",
      currency: "GBP",
    };
    const row = buildStudioSettingsContractPlaybookRule(pid, contract);
    expect(row).not.toBeNull();
    expect(row!.action_key).toBe(ACTION_KEY_STUDIO_SETTINGS_CONTRACT);
    expect(row!.scope).toBe("global");
    expect(row!.topic).toBe("identity");
    expect(row!.source_type).toBe("settings_backfill_step12a");

    const parsed = JSON.parse(studioSettingsContractInstructionV1(contract)) as Record<
      string,
      unknown
    >;
    expect(parsed.kind).toBe("settings_contract_backfill_v1");
    expect(parsed.studio_name).toBe("Northlight");
    expect(parsed.timezone).toBe("Europe/London");
    expect(parsed.currency).toBe("GBP");
  });
});
