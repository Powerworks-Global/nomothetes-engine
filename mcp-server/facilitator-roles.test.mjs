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

  it("skeptic runs after ontologist (needs a placed Rule to attach a Question to) and before contrarian", () => {
    const ontologistIdx = FACILITATOR_SEQUENCE.indexOf("ontologist");
    const skepticIdx = FACILITATOR_SEQUENCE.indexOf("skeptic");
    const contrarianIdx = FACILITATOR_SEQUENCE.indexOf("contrarian");
    expect(skepticIdx).toBeGreaterThan(ontologistIdx);
    expect(skepticIdx).toBeLessThan(contrarianIdx);
  });

  it("skeptic never places new elements - it only raises questions, unlike contrarian", () => {
    expect(FACILITATOR_ROLES.skeptic.primarySkills).not.toContain("place_element");
    expect(FACILITATOR_ROLES.skeptic.onGap).toBe("add_question");
  });
});
