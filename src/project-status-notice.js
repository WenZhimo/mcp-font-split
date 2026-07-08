export function buildProjectStatusNotice() {
  return {
    summaryType: 'project-status-notice',
    status: 'formal-release',
    formalRelease: true,
    stability: 'stable',
    directAnswer: 'This project is formally released as 1.0.0. Stable MCP tools, defaults, documented error types, and stable response fields are treated as a compatibility contract.',
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
      experimentalFieldCompatibility: 'Experimental fields are outside the stable contract and may change with release notes.',
    },
    forwardCompatibilityPolicy: {
      required: true,
      reason: 'The package is formally released; stable fields, documented defaults, and documented error types require compatibility discipline.',
      removeUnreleasedCompatibilityCruft: false,
      avoidPreservingStaleBehavior: false,
    },
    agentAction: 'Use current code, live schema, get_agent_guidance, current docs, and release notes as authoritative. Preserve stable behavior unless an intentional breaking change is documented with a version bump.',
    nonIntuitiveBehavior: [
      'Stable fields are the machine-consumption contract; diagnostic fields can grow or become more precise without being treated as breaking changes.',
      'Experimental fields remain outside the stable contract and should not be required by clients.',
      'After updating the package, rerun get_agent_guidance instead of relying on older conversation memory.',
    ],
  };
}
