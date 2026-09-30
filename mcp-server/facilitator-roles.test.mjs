import { describe, expect, it } from "vitest";
import { FACILITATOR_ROLES, FACILITATOR_SEQUENCE } from "./facilitator-roles.mjs";

describe("facilitator-roles", () => {
  it("every id in FACILITATOR_SEQUENCE has a matching entry in FACILITATOR_ROLES", () => {
    for (const id of FACILITATOR_SEQUENCE) {
      expect(FACILITATOR_ROLES[id]).toBeDefined();
      expect(FACILITATOR_ROLES[id].id).toBe(id);
    }
  });

  it("every role's primarySkills reference a real worker skill name", () => {
    const KNOWN_SKILLS = ["place_element", "edit_timeline", "edit_example_map", "run_wdyt", "freeze_spec"];
    for (const role of Object.values(FACILITATOR_ROLES)) {
      for (const skill of role.primarySkills) {
        expect(KNOWN_SKILLS).toContain(skill);
      }
    }
  });
});
