import type { PresetDefinition, PresetValue } from "./types";

// The full preset catalog — one entry per row in the "Preset System Design"
// vault note's 12 group tables. Defaults are opinionated and match what's
// already in use; `allowed` is the intended escape hatch (constrained, not
// free text); `locked` cannot be overridden; `derivedFrom`+`derive` follow
// another preset unless explicitly overridden.

function deriveVcsCi(base: PresetValue): PresetValue {
  switch (base) {
    case "gitlab":
      return "gitlab-ci";
    case "bitbucket":
      return "bitbucket-pipelines";
    case "azure":
      return "azure-pipelines";
    default:
      return "github-actions";
  }
}

function deriveRegistry(base: PresetValue): PresetValue {
  switch (base) {
    case "gitlab":
      return "gitlab-registry";
    case "github":
      return "github-packages";
    default:
      return "none";
  }
}

function deriveTestFramework(base: PresetValue): PresetValue {
  switch (base) {
    case "cratis-net":
    case "marten-net":
      return "xunit";
    case "react-node":
      return "vitest";
    default:
      return "none";
  }
}

export const PRESETS: PresetDefinition[] = [
  // 1. Language & locale
  { key: "language.ui", group: "language", label: "UI language", default: "english", allowed: ["english", "german"], scope: "user" },
  { key: "language.content", group: "language", label: "Content/input language", default: "english", allowed: ["english", "german"], scope: "project" },
  { key: "language.code", group: "language", label: "Code language", default: "english", locked: true, scope: "org" },
  { key: "locale", group: "language", label: "Locale (dates/numbers/currency)", default: "en-ie", allowed: ["en-ie", "de-de"], scope: "user" },
  { key: "timezone", group: "language", label: "Timezone", default: "Europe/Dublin", scope: "user" },

  // 2. Ideation
  { key: "ideation.workshopTemplate", group: "ideation", label: "Workshop template", default: "blank", allowed: ["blank", "miro", "story-arc-starter"], scope: "project" },
  { key: "ideation.facilitatorRole", group: "ideation", label: "Facilitator agent role", default: "socratic", allowed: ["socratic", "ontologist", "contrarian", "simplifier"], scope: "project" },
  { key: "ideation.ambiguityGate", group: "ideation", label: "Ambiguity gate", default: "on", allowed: ["on", "off", "scored"], scope: "project" },

  // 3. Identity & org
  { key: "org.name", group: "org", label: "Org name / branding", default: "", scope: "org" },
  { key: "org.region", group: "org", label: "Region/sovereignty", default: "eu", allowed: ["eu", "us", "other"], scope: "org" },
  { key: "org.dataResidency", group: "org", label: "Data residency", default: "eu", allowed: ["eu", "us", "per-project"], scope: "org" },

  // 4. Version control & CI
  { key: "vcs.provider", group: "vcs", label: "VCS provider", default: "github", allowed: ["github", "gitlab", "bitbucket", "azure"], scope: "org" },
  { key: "vcs.host", group: "vcs", label: "VCS host", default: "github.com", allowed: ["github.com", "self-hosted-gitlab", "github-enterprise"], scope: "org" },
  { key: "vcs.ciProvider", group: "vcs", label: "CI provider", default: "github-actions", allowed: ["github-actions", "gitlab-ci", "jenkins"], derivedFrom: "vcs.provider", derive: deriveVcsCi, scope: "org" },
  { key: "vcs.secrets", group: "vcs", label: "Secret management", default: "env", allowed: ["env", "sops", "vault"], scope: "org" },
  { key: "vcs.registry", group: "vcs", label: "Package registry", default: "github-packages", allowed: ["github-packages", "artifactory", "npmjs"], derivedFrom: "vcs.provider", derive: deriveRegistry, scope: "org" },

  // 5. Modeling
  { key: "modeling.method", group: "modeling", label: "Modeling method", default: "event-modeling", allowed: ["event-modeling", "storyboarding", "user-story-mapping"], scope: "project" },
  { key: "modeling.lanes", group: "modeling", label: "Layer 1 lanes", default: ["actor", "screen", "action", "outcome", "owned-data"], scope: "project" },
  { key: "modeling.cards", group: "modeling", label: "Layer 2 cards", default: ["rule", "example", "question"], scope: "project" },
  { key: "modeling.edges", group: "modeling", label: "Edge semantics", default: ["produces", "triggers", "reads"], scope: "project" },

  // 6. Design & UI (user preferences)
  { key: "design.canvasEngine", group: "design", label: "Canvas engine", default: "react-flow", allowed: ["react-flow", "tldraw", "custom"], scope: "user" },
  { key: "design.componentLibrary", group: "design", label: "Component library", default: "tailwind-custom", allowed: ["tailwind-custom", "material-ui", "shadcn"], scope: "user" },
  { key: "design.theme", group: "design", label: "Theme", default: "light", allowed: ["light", "dark", "brand"], scope: "user" },
  { key: "design.density", group: "design", label: "Density", default: "comfortable", allowed: ["comfortable", "compact"], scope: "user" },
  { key: "design.keyboardPrefs", group: "design", label: "Keyboard/UX preferences", default: "default", scope: "user" },

  // 7. Testing & verification
  { key: "testing.framework", group: "testing", label: "Test framework", default: "xunit", allowed: ["xunit", "junit", "vitest", "pytest"], derivedFrom: "integration.targetStack", derive: deriveTestFramework, scope: "project" },
  { key: "testing.gateMode", group: "testing", label: "Gate mode", default: "spec-coverage", allowed: ["spec-coverage", "semantic"], scope: "project" },
  { key: "testing.oracle", group: "testing", label: "Oracle harness", default: "downstream-harness", allowed: ["downstream-harness"], scope: "project" },
  { key: "testing.driftCheck", group: "testing", label: "Drift check", default: "on", allowed: ["on", "off"], scope: "project" },

  // 8. Integration (import/export)
  { key: "integration.targetStack", group: "integration", label: "Target stack", default: "cratis-net", allowed: ["cratis-net", "marten-net", "react-node", "other"], scope: "project" },
  { key: "integration.importSource", group: "integration", label: "Import source", default: "eventmodelers", allowed: ["eventmodelers", "miro", "markdown", "none"], scope: "project" },
  { key: "integration.exportFormat", group: "integration", label: "Export spec format", default: "downstream-harness", allowed: ["downstream-harness", "spec-kit", "markdown"], scope: "project" },
  { key: "integration.specWorkflow", group: "integration", label: "Spec-driven workflow", default: "spec-kit", allowed: ["spec-kit", "custom"], scope: "project" },

  // 9. Customer & commercial
  { key: "customer.billingModel", group: "customer", label: "Billing model", default: "fixed-per-slice", allowed: ["fixed-per-slice", "hourly", "t-and-m"], scope: "project" },
  { key: "customer.currency", group: "customer", label: "Currency", default: "EUR", allowed: ["EUR", "GBP", "USD"], scope: "project" },
  { key: "customer.sliceRate", group: "customer", label: "Default slice rate", default: 0, scope: "project" },

  // 10. Outbound communication
  { key: "communication.digestMode", group: "communication", label: "Stakeholder digest mode", default: "always-current", allowed: ["always-current", "versioned"], scope: "project" },
  { key: "communication.channel", group: "communication", label: "Channel", default: "markdown", allowed: ["markdown", "email", "slack", "teams"], scope: "project" },
  { key: "communication.notificationConsent", group: "communication", label: "Notification consent", default: "off", allowed: ["off", "consent-gated"], scope: "project" },

  // 11. Deploy & hosting
  { key: "deploy.hosting", group: "deploy", label: "Hosting", default: "firebase", allowed: ["firebase", "cloud-run", "netlify", "vercel"], scope: "project" },
  { key: "deploy.environment", group: "deploy", label: "Environment", default: "single", allowed: ["single", "staging-prod"], scope: "project" },

  // 12. Handover & operate
  { key: "handover.runbook", group: "handover", label: "Runbook generation", default: "from-actions", allowed: ["from-actions", "manual"], scope: "project" },
  { key: "handover.sloSource", group: "handover", label: "SLO/NFR source", default: "constitution", allowed: ["constitution", "per-client"], scope: "project" },
  { key: "handover.observability", group: "handover", label: "Observability", default: "lgtm", allowed: ["lgtm", "datadog", "prometheus"], scope: "project" },
  { key: "handover.docs", group: "handover", label: "Documentation", default: "vault", allowed: ["vault", "repo"], scope: "project" },

  // 13. Coding agent capabilities (added for the Slipway-style bootstrap
  // script — the one preset a fresh project's AGENTS.md/CLAUDE.md actually
  // needs to state plainly, since it governs what an agent is allowed to
  // do unattended in this repo).
  { key: "agent.autonomyLevel", group: "agent", label: "Agent autonomy level", default: "write-with-review", allowed: ["read-only", "propose-only", "write-with-review", "autonomous"], scope: "project" },
];
