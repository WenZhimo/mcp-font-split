import {
  OUTPUT_AUDIT_COMPLETION_CRITERIA,
} from './output-audit-criteria.js';
import {
  GUIDANCE_OUTPUT_STRUCTURE_FIELD_CATALOG,
} from './guidance-response-field-catalog.js';

export const OUTPUT_AUDIT_RESPONSE_FIELD_CATALOG = {
  manifestCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of output entries backed by split-meta.json manifests.',
    agentAction: 'Prefer manifest-backed counts for strict output audits.',
  },
  missingManifestCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of output entries that do not include split-meta.json manifests and were conservatively inferred from file structure.',
    agentAction: 'Treat these as less certain and consider regenerating output with manifest-backed entries before strict audits.',
  },
  structureSummary: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Machine-readable check for whether output files fit the documented split-output directory structure, including unexpected files, manifest coverage, and per-entry output-mode requirements.',
    agentAction: 'Check outputRoleDecision and outputStructureDecision.status first, then require structureSummary.conforms true before claiming the output directory is structurally valid; inspect issues[], unexpectedFileExamples[], unexpectedDepthFileExamples[], and entryIssueExamples[] when false.',
  },
  ...GUIDANCE_OUTPUT_STRUCTURE_FIELD_CATALOG,
  'structureSummary.layoutKind': {
    sourceTools: ['inspect_split_output'],
    meaning: 'Detected output layout kind, such as single-family, family-tree, mixed, empty, or unknown.',
    agentAction: 'Look up this value in outputStructureCatalog.layoutKinds before deciding whether the inspected outDir points at the correct output root.',
  },
  'structureSummary.depthProfile': {
    sourceTools: ['inspect_split_output'],
    meaning: 'Depth distribution for all scanned output files and original fonts, measured relative to the inspected outDir.',
    agentAction: 'Use this with layoutKind, unexpectedDepthFileCount, and unexpectedDepthFileExamples to tell whether outDir points one level too high/low or generated files were placed below the documented structure.',
  },
  'structureSummary.rootLevelDiagnosis': {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact diagnosis of whether the inspected outDir appears to be the expected split-output root, empty, mixed, unknown, or affected by unexpected depths.',
    agentAction: 'Read status, likelyCause, and recommendedAction before deciding whether to regenerate output or rerun inspect_split_output against a different root.',
  },
  'structureSummary.issues[].code': {
    sourceTools: ['inspect_split_output'],
    meaning: 'Machine-readable output structure issue code, such as missing-manifests, unexpected-output-files, or web-output-missing.',
    agentAction: 'Look up each code in outputStructureCatalog.issueCodes, then inspect unexpectedFileExamples, unexpectedDepthFileExamples, or entryIssueExamples for evidence.',
  },
  outputRoleDecision: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact machine-readable decision about whether the inspected outDir is a valid target for split-output auditing or appears to be organizer staging.',
    agentAction: 'Check this before outputStructureDecision. If isSplitOutput is false or auditAppliesToThisDirectory is false, inspect the directory as source-like staging with inspect_font_inputs and run split_font_batch safe-preview before auditing generated output.',
  },
  outputStructureDecision: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact machine-readable decision derived from outputRoleDecision, auditStatus, auditBlockingReasons, maxFilesHit, and structureSummary.',
    agentAction: 'Use this after outputRoleDecision to decide whether the output tree passed, needs a higher maxFiles rerun, points at organizer staging, or needs structureSummary issue review.',
  },
  auditStatus: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact output audit status: pass, incomplete, or action-required.',
    agentAction: OUTPUT_AUDIT_COMPLETION_CRITERIA,
  },
  auditPassed: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Boolean shortcut for auditStatus === pass.',
    agentAction: 'Treat false as a signal to inspect auditBlockingReasons and structureSummary before reporting completion.',
  },
  auditBlockingReasons: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact list of machine-readable reasons that prevent the output audit from passing.',
    agentAction: 'Inspect each code and follow issueCodes when structureSummary contains detailed structure failures.',
  },
  subsetOutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of inspected output entries that look like normal subset output.',
    agentAction: 'Use with singleWoff2OutputCount and copyOriginalOutputCount when summarizing output modes.',
  },
  singleWoff2OutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of inspected output entries that look like single-WOFF2 fallback output.',
    agentAction: 'Disclose these separately from normal multi-subset output.',
  },
  copyOriginalOutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of inspected output entries that only recorded copy-original handling.',
    agentAction: 'Disclose that these entries do not contain generated WOFF2/CSS output.',
  },
  filesIncluded: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Whether flat output files[] details are included.',
    agentAction: 'Rerun with includeFiles:true when file-level audit details are required.',
  },
  familiesIncluded: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Whether structured families[] details are included.',
    agentAction: 'Rerun with includeFamilies:true when family-level audit details are required.',
  },
};
