import { describe, expect, it } from "vitest";
import { buildSeedExampleMaps, parseAcceptanceCriteria, parseFunctionalRequirements } from "./import-eventmodelers.mjs";

describe("buildSeedExampleMaps", () => {
  it("seeds the Example node's requirementRef from the FR/AC pair (Phase 7 traceability follow-up)", () => {
    const reqText = [
      "## Functional Requirements",
      "| FR-1 | System MUST support Widget Creation, producing the WidgetCreated domain event(s) | Must | AC-1.1 |",
      "",
      "## User Stories",
      "- AC-1.1: _Creating a widget_ — Given no widget exists, When the user creates one, Then a WidgetCreated event is produced",
    ].join("\n");

    const acById = parseAcceptanceCriteria(reqText);
    const frRows = parseFunctionalRequirements(reqText);
    const elementSliceByLabel = new Map();
    const eventSliceByLabel = new Map([["WidgetCreated", ["slice-1"]]]);

    const seeds = buildSeedExampleMaps(elementSliceByLabel, eventSliceByLabel, frRows, acById, "spec-x");

    const exampleNode = seeds["slice-1"].nodes.find((n) => n.data.nodeType === "example");
    expect(exampleNode.data.requirementRef).toEqual({ acId: "AC-1.1", frId: "FR-1" });
  });
});
