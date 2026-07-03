import {
  OUTPUT_AUDIT_PASS_CRITERIA_LIST,
  OUTPUT_AUDIT_REPORT_PASS_ACTION,
} from './output-audit-criteria.js';

export const OUTPUT_STRUCTURE_CATALOG = Object.freeze({
  summaryType: 'output-structure-catalog',
  purpose: 'Machine-readable companion for inspect_split_output outputRoleDecision, outputStructureDecision, and structureSummary fields.',
  passCriteria: OUTPUT_AUDIT_PASS_CRITERIA_LIST,
  nonIntuitiveBehavior: [
    'ok:true means inspect_split_output ran; it is not proof that the output tree structure passed.',
    'outputRoleDecision can stop the audit when outDir is organizer staging rather than generated split output.',
    'includeFiles:false and includeFamilies:false can hide large arrays while still running structureSummary checks.',
    'structureSummary.depthProfile is still returned in compact audits and can diagnose wrong output-root level selection without returning files[] or families[].',
    'copy-original entries intentionally do not produce result.css or WOFF2 files.',
    'missing split-meta.json manifests make entries lower confidence even when files can be inferred from structure.',
  ],
  auditStatuses: {
    pass: {
      status: 'pass',
      meaning: 'The scan was not truncated and no structure blockers were found.',
      agentAction: OUTPUT_AUDIT_REPORT_PASS_ACTION,
    },
    'action-required': {
      status: 'action-required',
      meaning: 'The scan completed but structureSummary found issues that need review.',
      agentAction: 'Inspect outputRoleDecision, outputStructureDecision.issueCodes, auditBlockingReasons, structureSummary.issues, unexpectedFileExamples, unexpectedDepthFileExamples, and entryIssueExamples before reporting completion.',
    },
    incomplete: {
      status: 'incomplete',
      meaning: 'The output scan hit maxFiles, so the audit is not complete for the requested output root.',
      agentAction: 'Rerun inspect_split_output with a higher maxFiles before treating counts or structure as complete.',
    },
  },
  layoutKinds: {
    empty: {
      layoutKind: 'empty',
      conforms: false,
      meaning: 'No output files were found under the inspected output directory.',
      agentAction: 'Treat as not processed or wrong output root unless the user only asked for an empty-output check.',
    },
    'single-family': {
      layoutKind: 'single-family',
      conformsWhenNoIssues: true,
      meaning: 'The inspected output root itself represents one family: original fonts are at the root and processed font-entry directories are one level below.',
      expectedShape: '<outDir>/<OriginalFontFile> plus <outDir>/<FontBaseName>/split-meta.json and generated files.',
      agentAction: 'Accept only when structureSummary.conforms is true and manifest coverage is complete.',
    },
    'family-tree': {
      layoutKind: 'family-tree',
      conformsWhenNoIssues: true,
      meaning: 'The inspected output root contains one directory per family: original fonts are inside each family directory and processed font-entry directories are below that.',
      expectedShape: '<outDir>/<FamilyName>/<OriginalFontFile> plus <outDir>/<FamilyName>/<FontBaseName>/split-meta.json and generated files.',
      agentAction: 'This is the normal batch output shape; accept only when structureSummary.conforms is true and manifest coverage is complete.',
    },
    mixed: {
      layoutKind: 'mixed',
      conforms: false,
      meaning: 'Original font files were detected at both single-family and family-tree depths.',
      agentAction: 'Inspect structureSummary.issues and unexpected file examples; this usually means output roots or source/output paths were mixed.',
    },
    unknown: {
      layoutKind: 'unknown',
      conforms: false,
      meaning: 'The output tree does not fit either documented single-family or family-tree layouts.',
      agentAction: 'Inspect structureSummary.issues, unexpectedDepthFileCount, unexpectedDepthFileExamples, and unexpectedFileExamples before deciding whether to regenerate or move outputs.',
    },
  },
  outputModes: {
    subset: {
      outputMode: 'subset',
      requiredFiles: ['split-meta.json', 'result.css', '*.woff2'],
      optionalFiles: ['index.html', 'reporter.bin', 'index.proto'],
      meaning: 'Normal multi-subset output from cn-font-split.',
      agentAction: 'Report as normal split output only when performedSplit was true or inspect output confirms subset mode with required files.',
    },
    'single-woff2': {
      outputMode: 'single-woff2',
      requiredFiles: ['split-meta.json', 'result.css', '<FontBaseName>.woff2'],
      optionalFiles: ['index.html'],
      meaning: 'Fallback output with one WOFF2 file rather than multi-subset chunks.',
      agentAction: 'Disclose fallback behavior; do not describe this as normal multi-subset splitting.',
    },
    'copy-original': {
      outputMode: 'copy-original',
      requiredFiles: ['split-meta.json'],
      optionalFiles: [],
      meaning: 'The source font was recorded and original font copy preserved, but web-font CSS/WOFF2 output was intentionally not generated.',
      agentAction: 'Do not treat missing result.css or WOFF2 as a failure for copy-original entries.',
    },
    unknown: {
      outputMode: 'unknown',
      requiredFiles: [],
      optionalFiles: [],
      meaning: 'The entry could not be mapped to a known output mode.',
      agentAction: 'Inspect split-meta.json and file contents before reporting what was produced.',
    },
  },
  depthProfile: {
    summaryType: 'output-depth-profile-catalog',
    purpose: 'Explains structureSummary.depthProfile, which summarizes relative file depths for output-root troubleshooting.',
    depthBase: 'Depths are relative to the inspected outDir, not the workspace root.',
    expectedLayouts: {
      'single-family': {
        expectedOriginalFontDepths: [1],
        expectedOutputFileDepths: [2],
      },
      'family-tree': {
        expectedOriginalFontDepths: [2],
        expectedOutputFileDepths: [3],
      },
    },
    agentAction: 'Compare fileDepthCounts and originalFontDepthCounts with the expected layout depths before deciding whether to regenerate output or rerun inspect_split_output against a different outDir.',
  },
  rootLevelDiagnosis: {
    summaryType: 'output-root-level-diagnosis-catalog',
    purpose: 'Explains structureSummary.rootLevelDiagnosis, the compact outDir root-level interpretation derived from layoutKind and depth evidence.',
    statuses: {
      'expected-root': 'The inspected outDir matches the expected single-family or family-tree root depth shape.',
      'unexpected-depth': 'The output shape is recognizable but files appear too shallow or too deep for the documented layout.',
      'mixed-root': 'Single-family and family-tree original depths appear together, often from merged output roots.',
      'unknown-root': 'The inspected tree does not expose enough recognized original/output evidence for a stable layout.',
      empty: 'No output files were found under outDir.',
    },
    agentAction: 'Use rootLevelDiagnosis.status and likelyCause as the first compact hint, then inspect depthProfile and examples for concrete file evidence.',
  },
  staleResidueDiagnosis: {
    summaryType: 'output-stale-residue-diagnosis-catalog',
    purpose: 'Explains structureSummary.staleResidueDiagnosis, the compact stale-output-residue hint derived from unexpected generated-looking files and copy-original entry issues.',
    statuses: {
      'none-detected': 'No unexpected generated-looking residue was detected by the compact audit.',
      'suspected-residue': 'Unexpected generated-looking files or copy-original entries with generated output suggest stale files from an older run.',
    },
    likelyCauses: {
      none: 'No stale residue signal was detected.',
      'unexpected-generated-files': 'Files such as result.css, split-meta.json, or WOFF2 outputs were found outside recognized font-entry output locations.',
      'copy-original-entry-has-generated-output': 'A manifest-declared copy-original entry also contains generated CSS or WOFF2 files.',
      'unexpected-generated-files-and-copy-original-extra-output': 'Both unexpected generated-looking files and copy-original entries with generated output were detected.',
    },
    agentAction: 'If status is suspected-residue, inspect examples and regenerate into a clean output root or remove stale generated files before reporting structural success.',
  },
  issueCodes: {
    'empty-output': {
      code: 'empty-output',
      severity: 'action-required',
      meaning: 'No output files were found.',
      agentAction: 'Verify outDir points to the generated output root and rerun the producing tool if needed.',
    },
    'mixed-output-layout': {
      code: 'mixed-output-layout',
      severity: 'action-required',
      meaning: 'Original font files appear at both root and family-directory depths.',
      agentAction: 'Check whether multiple output roots were merged or whether outputRoot was pointed at the wrong level.',
    },
    'unknown-output-layout': {
      code: 'unknown-output-layout',
      severity: 'action-required',
      meaning: 'The output tree does not match the expected single-family or family-tree layout.',
      agentAction: 'Inspect unexpectedDepthFileCount, unexpectedDepthFileExamples, and unexpectedFileExamples, then regenerate or choose the correct output root.',
    },
    'unexpected-original-depth': {
      code: 'unexpected-original-depth',
      severity: 'action-required',
      meaning: 'Original font files were detected at path depths outside documented output layouts.',
      agentAction: 'Review source/output root selection and remove stray copied originals from generated output if appropriate.',
    },
    'unexpected-output-files': {
      code: 'unexpected-output-files',
      severity: 'action-required',
      meaning: 'Files were found outside recognized family/font-entry output locations.',
      agentAction: 'Inspect unexpectedFileExamples to distinguish harmless notes from misplaced generated files before reporting success.',
    },
    'unexpected-output-depth': {
      code: 'unexpected-output-depth',
      severity: 'action-required',
      meaning: 'Files were found at depths outside the documented output structure.',
      agentAction: 'Inspect unexpectedDepthFileExamples and confirm whether outDir points one level too high or too low.',
    },
    'missing-manifests': {
      code: 'missing-manifests',
      severity: 'action-required',
      meaning: 'Some font entries do not include split-meta.json and were inferred from file structure.',
      agentAction: 'Treat those entries as lower confidence; rerun generation or inspect per-entry files before strict completion claims.',
    },
    'unknown-output-mode': {
      code: 'unknown-output-mode',
      severity: 'action-required',
      meaning: 'Some font entries have an unknown output mode.',
      agentAction: 'Inspect entryIssueExamples and split-meta.json before describing output mode counts.',
    },
    'web-output-missing': {
      code: 'web-output-missing',
      severity: 'action-required',
      meaning: 'A subset or single-WOFF2 entry is missing result.css or WOFF2 files.',
      agentAction: 'Treat web-font output as incomplete for that entry unless the user explicitly requested copy-original behavior.',
    },
    'copy-original-extra-output': {
      code: 'copy-original-extra-output',
      severity: 'action-required',
      meaning: 'A copy-original entry unexpectedly contains generated CSS or WOFF2 files.',
      agentAction: 'Inspect the manifest and entry files; the output directory may contain stale files from an older run.',
    },
    'organized-staging-not-split-output': {
      code: 'organized-staging-not-split-output',
      severity: 'action-required',
      meaning: 'The inspected directory contains font-organization-manifest.json, so it looks like organize_font_directory staging rather than generated split output.',
      agentAction: 'Inspect the directory with inspect_font_inputs, then run split_font_batch safe-preview; reserve inspect_split_output for the generated split output root.',
    },
  },
});
