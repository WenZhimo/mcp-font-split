export function buildProjectStatusNotice() {
  return {
    summaryType: 'project-status-notice',
    status: 'actively-being-refined',
    formalRelease: false,
    stability: 'pre-release',
    directAnswer: 'This project is still being refined and has not been formally released; interfaces, defaults, response fields, directory-organization policy, and docs may change.',
    authoritativeSources: [
      'current repository code',
      'get_agent_guidance',
      'live MCP tool schema',
      'API.md / API.zh-CN.md',
      'BEHAVIOR.en.md / BEHAVIOR.zh-CN.md',
      'get_agent_guidance.interfaceContract',
    ],
    interfaceContractPolicy: {
      currentContractVersion: '0.2.0',
      stableFieldsDocumented: true,
      stableFieldCompatibility: 'Stable fields should not be removed, renamed, or changed in type without a breaking-change note and version bump.',
      diagnosticFieldCompatibility: 'Diagnostic fields may grow or become more precise; callers should not depend on exact membership or wording.',
      experimentalFieldCompatibility: 'Experimental fields may change while formalRelease remains false.',
    },
    forwardCompatibilityPolicy: {
      required: false,
      reason: 'The package is not formally released yet.',
      removeUnreleasedCompatibilityCruft: true,
      avoidPreservingStaleBehavior: true,
    },
    agentAction: 'Use current code, live schema, get_agent_guidance, and current docs as authoritative. When improving this package before formal release, prefer clear current behavior over preserving stale compatibility fields.',
    nonIntuitiveBehavior: [
      'Pre-release response fields and defaults may change when that makes the tool easier to understand or safer for agents.',
      'Compatibility shims for unreleased fields should be removed when they add noise or contradict current behavior.',
      'After updating the package, rerun get_agent_guidance instead of relying on older conversation memory.',
    ],
  };
}
