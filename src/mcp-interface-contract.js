import { z } from 'zod';

const JsonObject = z.object({}).passthrough();
const JsonArray = z.array(z.unknown());
const OptionalString = z.string().nullable().optional();

function toolOutputSchema(successSchema) {
  return successSchema.extend({
    ok: z.boolean(),
    error: z.string().optional(),
    name: z.string().optional(),
    errorType: z.string().optional(),
    details: z.unknown().optional(),
  }).partial().required({ ok: true }).passthrough();
}

const ToolBaseOutputSchema = z.object({
  ok: z.boolean(),
}).passthrough();

const GuidanceOutputSchema = ToolBaseOutputSchema.extend({
  purpose: z.string(),
  workflow: z.string(),
  guidanceView: JsonObject,
  projectStatusNotice: JsonObject,
  toolSafetyQuickReference: JsonObject,
  responseFieldsToCheck: JsonArray,
}).passthrough();

const RuntimeStatusOutputSchema = ToolBaseOutputSchema.extend({
  packageName: z.string(),
  packageVersion: z.string(),
  nodeVersion: z.string(),
  workspace: JsonObject,
  checks: JsonArray,
  recommendedActions: JsonArray,
}).passthrough();

const SplitFontOutputSchema = ToolBaseOutputSchema.extend({
  input: z.string(),
  outDir: z.string(),
  splitDir: z.string(),
  resultType: z.string(),
  outputMode: z.string(),
  performedSplit: z.boolean(),
  usedFallback: z.boolean(),
  warnings: JsonArray,
  manifestPath: OptionalString,
}).passthrough();

const BatchOutputSchema = ToolBaseOutputSchema.extend({
  inputDir: z.string(),
  outputRoot: z.string(),
  dryRun: z.boolean(),
  batchDecision: JsonObject,
  batchWarnings: JsonArray,
  batchWarningCount: z.number(),
  sourceSafetyDecision: JsonObject,
  safetySummary: JsonObject,
  batchPolicySummary: JsonObject,
  dedupeDecisionSummary: JsonObject,
  maxFilesHit: z.boolean(),
  errorCount: z.number(),
  errors: JsonArray,
}).passthrough();

const InspectInputOutputSchema = ToolBaseOutputSchema.extend({
  inputDir: z.string(),
  scannedFileCount: z.number(),
  supportedFontCount: z.number(),
  unsupportedFileCount: z.number(),
  inputCountGuide: JsonObject,
  unsupportedFileDecision: JsonObject,
  unsupportedFileSummary: JsonObject,
  maxFiles: z.number(),
  maxFilesHit: z.boolean(),
  filesIncluded: z.boolean(),
  layout: JsonObject,
  recommendedBatchPreviewArgs: JsonObject,
  inputDirectoryDecision: JsonObject,
  inspectionWarningCount: z.number(),
  inspectionWarnings: JsonArray,
}).passthrough();

const OrganizationOutputSchema = ToolBaseOutputSchema.extend({
  inputDir: z.string(),
  outputDir: z.string(),
  dryRun: z.boolean(),
  operationMode: z.string(),
  sourceSafetyDecision: JsonObject,
  safetySummary: JsonObject,
  layoutDecision: JsonObject,
  stagingDirectoryDecision: JsonObject,
  organizationDecision: JsonObject,
  directoryWorkflowSummary: JsonObject,
  sourceLayoutMismatchSummary: JsonObject,
  batchPolicySummary: JsonObject,
  dedupeDecisionSummary: JsonObject,
  inputCountGuide: JsonObject,
  unsupportedFileDecision: JsonObject,
  unsupportedFileSummary: JsonObject,
  maxFilesHit: z.boolean(),
  errorCount: z.number(),
  errors: JsonArray,
}).passthrough();

const OutputAuditSchema = ToolBaseOutputSchema.extend({
  outDir: z.string(),
  outputRoleDecision: JsonObject,
  outputStructureDecision: JsonObject,
  auditStatus: z.string(),
  auditPassed: z.boolean(),
  auditBlockingReasons: JsonArray,
  structureSummary: JsonObject,
  maxFilesHit: z.boolean(),
  inspectionWarningCount: z.number(),
  inspectionWarnings: JsonArray,
  manifestCount: z.number(),
  missingManifestCount: z.number(),
  filesIncluded: z.boolean(),
  familiesIncluded: z.boolean(),
}).passthrough();

export const MCP_TOOL_OUTPUT_SCHEMAS = {
  get_agent_guidance: toolOutputSchema(GuidanceOutputSchema),
  get_runtime_status: toolOutputSchema(RuntimeStatusOutputSchema),
  split_font: toolOutputSchema(SplitFontOutputSchema),
  split_font_batch: toolOutputSchema(BatchOutputSchema),
  inspect_font_inputs: toolOutputSchema(InspectInputOutputSchema),
  organize_font_directory: toolOutputSchema(OrganizationOutputSchema),
  inspect_split_output: toolOutputSchema(OutputAuditSchema),
};

export const MCP_INTERFACE_CONTRACT_VERSION = '0.2.0';

export const MCP_FIELD_STABILITY_LEVELS = {
  stable: {
    summary: 'Supported machine-consumption contract for formal 1.0 releases.',
    compatibility: 'Do not remove, rename, or change type without a breaking-change note and version bump.',
  },
  diagnostic: {
    summary: 'Supported troubleshooting evidence that may grow or become more precise.',
    compatibility: 'Keep meaning stable when practical, but callers should not require exact membership or wording.',
  },
  experimental: {
    summary: 'Unstable helper detail for agent iteration and local debugging.',
    compatibility: 'Outside the stable contract; may change with release notes.',
  },
};

export const MCP_STABLE_OUTPUT_FIELDS_BY_TOOL = {
  get_agent_guidance: [
    'ok',
    'purpose',
    'workflow',
    'guidanceView',
    'projectStatusNotice',
    'toolSafetyQuickReference',
    'responseFieldsToCheck',
  ],
  get_runtime_status: [
    'ok',
    'packageName',
    'packageVersion',
    'nodeVersion',
    'workspace',
    'checks',
    'recommendedActions',
  ],
  split_font: [
    'ok',
    'input',
    'outDir',
    'splitDir',
    'resultType',
    'outputMode',
    'performedSplit',
    'usedFallback',
    'warnings',
    'manifestPath',
  ],
  split_font_batch: [
    'ok',
    'inputDir',
    'outputRoot',
    'dryRun',
    'batchDecision',
    'batchWarnings',
    'batchWarningCount',
    'sourceSafetyDecision',
    'safetySummary',
    'batchPolicySummary',
    'dedupeDecisionSummary',
    'maxFilesHit',
    'errorCount',
    'errors',
  ],
  inspect_font_inputs: [
    'ok',
    'inputDir',
    'scannedFileCount',
    'supportedFontCount',
    'unsupportedFileCount',
    'inputCountGuide',
    'unsupportedFileDecision',
    'unsupportedFileSummary',
    'maxFiles',
    'maxFilesHit',
    'filesIncluded',
    'layout',
    'recommendedBatchPreviewArgs',
    'inputDirectoryDecision',
    'inspectionWarningCount',
    'inspectionWarnings',
  ],
  organize_font_directory: [
    'ok',
    'inputDir',
    'outputDir',
    'dryRun',
    'operationMode',
    'sourceSafetyDecision',
    'safetySummary',
    'layoutDecision',
    'stagingDirectoryDecision',
    'organizationDecision',
    'directoryWorkflowSummary',
    'sourceLayoutMismatchSummary',
    'batchPolicySummary',
    'dedupeDecisionSummary',
    'inputCountGuide',
    'unsupportedFileDecision',
    'unsupportedFileSummary',
    'maxFilesHit',
    'errorCount',
    'errors',
  ],
  inspect_split_output: [
    'ok',
    'outDir',
    'outputRoleDecision',
    'outputStructureDecision',
    'auditStatus',
    'auditPassed',
    'auditBlockingReasons',
    'structureSummary',
    'maxFilesHit',
    'inspectionWarningCount',
    'inspectionWarnings',
    'manifestCount',
    'missingManifestCount',
    'filesIncluded',
    'familiesIncluded',
  ],
};

export const MCP_DIAGNOSTIC_FIELD_PATTERNS = [
  'warnings',
  'inspectionWarnings',
  'batchWarnings',
  'unsupportedFileSummary',
  'dedupeDecisionSummary',
  'structureSummary',
  'configurationTrace',
  'recommendedNextActions',
  'localVerificationOutputGuide',
  'toolResponseFieldCatalog',
  'errorResponseCatalog',
  'warningCodeCatalog',
];

export const MCP_EXPERIMENTAL_FIELD_PATTERNS = [
  'debugBatchDecisions',
  'debug',
  'evidence',
  'examples',
  'decisionChecklist',
  'directoryWorkflowExamples',
];
