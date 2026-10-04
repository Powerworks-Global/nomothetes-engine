import { usePresets } from "./presetContext";

// Minimal i18n for Nomothetes's UI chrome. Two languages (English, German),
// driven by the `language.ui` preset; the Given/When/Then vocabulary is
// driven separately by `language.content`. `language.code` stays English
// (locked) — this module only touches human-facing strings, never code,
// identifiers, or generated output.

type StringMap = Record<string, string>;

const en: StringMap = {
  "panel.settings": "Settings",
  "panel.storyArc": "Story-arc",
  "panel.slices": "Slices",
  "panel.scenario": "Scenario",
  "panel.exampleMap": "Example Map →",
  "panel.addScenario": "Add Scenario",
  "panel.editScenario": "Edit Scenario",
  "panel.deleteSlice": "Delete Slice",
  "panel.noScenario": "No scenario attached to this element yet.",
  "panel.clickHint": "Click a card to view its attached scenario (Given/When/Then).",
  "panel.nodes": "nodes",
  "panel.edges": "edges",
  "panel.board": "Board",
  "panel.importedFrom": "imported from",
  "panel.concerns": "Cross-Cutting Concerns",
  "panel.concernWhy": "Why:",
  "panel.concernCheck": "Check:",
  "panel.concernAlert": "Alert:",
  "panel.concernAppliesTo": "Applies to:",

  "em.back": "← Back to Timeline",
  "em.titlePrefix": "Example Map — ",
  "em.addRule": "+ Rule",
  "em.addExample": "+ Example",
  "em.addQuestion": "+ Question",
  "em.markAnswered": "Mark Answered",
  "em.exportJson": "Export Board JSON",

  "settings.title": "Nomothetes — Settings",
  "settings.close": "Close",
  "settings.subtitle": "Opinionated defaults with overrides. Changes persist to this browser and resolve immediately.",
  "settings.locked": "locked",
  "settings.default": "(default)",

  "gwt.given": "Given",
  "gwt.when": "When",
  "gwt.then": "Then",
  "gwt.answer": "Answer",

  "prompt.ruleText": "Rule text?",
  "prompt.exampleTitle": "Example title?",
  "prompt.questionText": "Question text?",
  "prompt.selectRule": "Select a Rule card first — Examples and Questions attach to a Rule.",
  "prompt.selectQuestion": "Select a Question card first.",
  "prompt.storyboardLabel": "Node label?",
  "prompt.storyboardSliceId": "Slice id? (matches an existing one, or creates a new column)",
  "prompt.addNodePrefix": "+",
  "prompt.deleteSliceConfirm": "Delete this slice and all of its nodes?",
  "prompt.deleteSliceConcernWarning": "Warning: Cross-Cutting Concern(s) reference this slice:",

  "group.language": "Language & locale",
  "group.ideation": "Ideation",
  "group.org": "Identity & org",
  "group.vcs": "Version control & CI",
  "group.modeling": "Modeling",
  "group.design": "Design & UI",
  "group.testing": "Testing & verification",
  "group.integration": "Integration",
  "group.customer": "Customer & commercial",
  "group.communication": "Outbound communication",
  "group.deploy": "Deploy & hosting",
  "group.handover": "Handover & operate",
};

const de: StringMap = {
  "panel.settings": "Einstellungen",
  "panel.storyArc": "Story-Bogen",
  "panel.slices": "Slices",
  "panel.scenario": "Szenario",
  "panel.exampleMap": "Beispielkarte →",
  "panel.addScenario": "Szenario hinzufügen",
  "panel.editScenario": "Szenario bearbeiten",
  "panel.deleteSlice": "Slice löschen",
  "panel.noScenario": "Diesem Element ist noch kein Szenario zugeordnet.",
  "panel.clickHint": "Klicken Sie auf eine Karte, um ihr zugeordnetes Szenario (Gegeben/Wann/Dann) anzuzeigen.",
  "panel.nodes": "Knoten",
  "panel.edges": "Kanten",
  "panel.board": "Board",
  "panel.importedFrom": "importiert aus",
  "panel.concerns": "Querschnittsbelange",
  "panel.concernWhy": "Warum:",
  "panel.concernCheck": "Prüfung:",
  "panel.concernAlert": "Alarm:",
  "panel.concernAppliesTo": "Gilt für:",

  "em.back": "← Zurück zur Zeitleiste",
  "em.titlePrefix": "Beispielkarte — ",
  "em.addRule": "+ Regel",
  "em.addExample": "+ Beispiel",
  "em.addQuestion": "+ Frage",
  "em.markAnswered": "Als beantwortet markieren",
  "em.exportJson": "Board als JSON exportieren",

  "settings.title": "Nomothetes — Einstellungen",
  "settings.close": "Schließen",
  "settings.subtitle": "Meinungsstarke Standardwerte mit Überschreibungen. Änderungen werden in diesem Browser gespeichert und sofort aufgelöst.",
  "settings.locked": "gesperrt",
  "settings.default": "(Standard)",

  "gwt.given": "Gegeben",
  "gwt.when": "Wann",
  "gwt.then": "Dann",
  "gwt.answer": "Antwort",

  "prompt.ruleText": "Regeltext?",
  "prompt.exampleTitle": "Beispieltitel?",
  "prompt.questionText": "Fragetext?",
  "prompt.selectRule": "Wählen Sie zuerst eine Regelkarte aus — Beispiele und Fragen hängen an einer Regel.",
  "prompt.selectQuestion": "Wählen Sie zuerst eine Fragenkarte aus.",
  "prompt.storyboardLabel": "Knotenbezeichnung?",
  "prompt.storyboardSliceId": "Slice-ID? (entspricht einer vorhandenen oder erstellt eine neue Spalte)",
  "prompt.addNodePrefix": "+",
  "prompt.deleteSliceConfirm": "Diesen Slice und alle seine Knoten löschen?",
  "prompt.deleteSliceConcernWarning": "Warnung: Querschnittsbelang(e) verweisen auf diesen Slice:",

  "group.language": "Sprache & Region",
  "group.ideation": "Ideenfindung",
  "group.org": "Identität & Organisation",
  "group.vcs": "Versionskontrolle & CI",
  "group.modeling": "Modellierung",
  "group.design": "Design & UI",
  "group.testing": "Testen & Verifikation",
  "group.integration": "Integration",
  "group.customer": "Kunde & Kommerziell",
  "group.communication": "Ausgehende Kommunikation",
  "group.deploy": "Deployment & Hosting",
  "group.handover": "Übergabe & Betrieb",
};

export interface GwtLabels {
  given: string;
  when: string;
  then: string;
  answer: string;
}

/** The active translations for the current `language.ui`, plus the
 * Given/When/Then vocabulary for the current `language.content`. */
export function useI18n(): { t: (key: string) => string; gwt: GwtLabels } {
  const { resolved } = usePresets();
  const ui = String(resolved["language.ui"]?.value ?? "english");
  const content = String(resolved["language.content"]?.value ?? "english");
  const strings = ui === "german" ? de : en;
  const c = content === "german" ? de : en;
  return {
    t: (key: string) => strings[key] ?? key,
    gwt: {
      given: c["gwt.given"],
      when: c["gwt.when"],
      then: c["gwt.then"],
      answer: c["gwt.answer"],
    },
  };
}
