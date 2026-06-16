export const RUNTIME_STATUS_NODE_FIELD_CATALOG = {
  node: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Node.js runtime details, including whether the current version satisfies package.json engines.',
    agentAction: 'If node.ok is false, handle recommendedActions before processing fonts.',
  },
};

export const RUNTIME_STATUS_RUNTIME_FIELD_CATALOG = {
  wasm: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Resolved cn-font-split WASM runtime path and filesystem status.',
    agentAction: 'If missing or not a file, follow recommendedActions before splitting.',
  },
  'wasm.fontSplitWasmPathConfigured': {
    sourceTools: ['get_runtime_status'],
    meaning: 'Whether FONT_SPLIT_WASM_PATH overrides the packaged cn-font-split WASM runtime.',
    agentAction: 'Disclose custom-runtime use when debugging compatibility or reproducibility.',
  },
  cnFontSplit: {
    sourceTools: ['get_runtime_status'],
    meaning: 'cn-font-split package and WASM runtime version metadata.',
    agentAction: 'Use this to diagnose version drift between the wrapper, package, and WASM runtime.',
  },
  'cnFontSplit.packageVersion': {
    sourceTools: ['get_runtime_status'],
    meaning: 'Installed cn-font-split package version.',
    agentAction: 'Compare with expected dependency versions when reproducing behavior.',
  },
  'cnFontSplit.runtimeVersion': {
    sourceTools: ['get_runtime_status'],
    meaning: 'Recorded cn-font-split WASM runtime release, when available.',
    agentAction: 'Record or repair the runtime when runtimeVersion is missing unexpectedly.',
  },
  recommendedActions: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Machine-readable setup remediation actions.',
    agentAction: 'Handle action-required items before calling writing tools.',
  },
};
