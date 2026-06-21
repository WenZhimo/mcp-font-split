import {
  GUIDANCE_BATCH_RECOMMENDATION_FIELD_CATALOG,
  GUIDANCE_CONFIGURATION_FIELD_CATALOG,
  GUIDANCE_DIRECTORY_HANDLING_FIELD_CATALOG,
  GUIDANCE_DIRECTORY_WORKFLOW_FIELD_CATALOG,
  GUIDANCE_HEADER_FIELD_CATALOG,
  GUIDANCE_IDENTITY_FIELD_CATALOG,
  GUIDANCE_REFERENCE_FIELD_CATALOG,
  GUIDANCE_SAFE_WORKFLOW_FIELD_CATALOG,
  GUIDANCE_WARNING_FIELD_CATALOG,
  GUIDANCE_WORKFLOW_PRESET_FIELD_CATALOG,
} from './guidance-response-field-catalog.js';
import {
  RUNTIME_STATUS_NODE_FIELD_CATALOG,
  RUNTIME_STATUS_RUNTIME_FIELD_CATALOG,
} from './runtime-status-response-field-catalog.js';
import {
  RESULT_SHAPE_RESPONSE_FIELD_CATALOG,
} from './result-shape-response-field-catalog.js';
import {
  SHARED_DRY_RUN_RESPONSE_FIELD_CATALOG,
  SHARED_PLAN_VISIBILITY_RESPONSE_FIELD_CATALOG,
  SHARED_RECOMMENDED_NEXT_ACTIONS_RESPONSE_FIELD_CATALOG,
  WORKFLOW_SCAN_LIMIT_RESPONSE_FIELD_CATALOG,
} from './workflow-action-response-field-catalog.js';
import {
  COMPACT_CHECK_RESPONSE_FIELD_CATALOG,
  REAL_CORPUS_CHECK_RESPONSE_FIELD_CATALOG,
} from './local-verification-response-field-catalog.js';
import {
  INSPECTION_WARNING_RESPONSE_FIELD_CATALOG,
} from './inspection-warning-response-field-catalog.js';
import {
  SOURCE_INPUT_SCAN_RESPONSE_FIELD_CATALOG,
} from './source-input-response-field-catalog.js';
import {
  SOURCE_LAYOUT_RESPONSE_FIELD_CATALOG,
} from './source-layout-response-field-catalog.js';
import {
  INPUT_PREFLIGHT_ROUTE_RESPONSE_FIELD_CATALOG,
} from './input-preflight-response-field-catalog.js';
import {
  SOURCE_SAFETY_SUMMARY_RESPONSE_FIELD_CATALOG,
  SOURCE_SAFETY_WRITE_SCOPE_RESPONSE_FIELD_CATALOG,
} from './source-safety-response-field-catalog.js';
import {
  OUTPUT_AUDIT_RESPONSE_FIELD_CATALOG,
} from './output-audit-response-field-catalog.js';
import {
  BATCH_DECISION_RESPONSE_FIELD_CATALOG,
  BATCH_ERROR_AND_INCREMENTAL_RESPONSE_FIELD_CATALOG,
  BATCH_PLAN_RESPONSE_FIELD_CATALOG,
  BATCH_RESULT_RESPONSE_FIELD_CATALOG,
  BATCH_SKIP_MODE_RESPONSE_FIELD_CATALOG,
} from './batch-response-field-catalog.js';
import {
  SHARED_BATCH_IDENTITY_EVIDENCE_RESPONSE_FIELD_CATALOG,
  SHARED_BATCH_MODE_RESPONSE_FIELD_CATALOG,
  SHARED_BATCH_POLICY_RESPONSE_FIELD_CATALOG,
  SHARED_BATCH_WORKFLOW_RESPONSE_FIELD_CATALOG,
} from './batch-policy-response-field-catalog.js';
import {
  ORGANIZATION_DIRECTORY_WORKFLOW_RESPONSE_FIELD_CATALOG,
  ORGANIZATION_OPERATION_RESPONSE_FIELD_CATALOG,
  ORGANIZATION_PARSING_RESPONSE_FIELD_CATALOG,
  ORGANIZATION_WARNING_RESPONSE_FIELD_CATALOG,
} from './organization-response-field-catalog.js';

export const ALL_TOOL_NAMES = [
  'get_agent_guidance',
  'get_runtime_status',
  'inspect_font_inputs',
  'organize_font_directory',
  'split_font',
  'split_font_batch',
  'inspect_split_output',
];

export const TOOL_RESPONSE_FIELD_CATALOG = {
  ok: {
    sourceTools: ALL_TOOL_NAMES,
    meaning: 'Tool-level success flag. It means the selected policy completed, not necessarily that a normal multi-subset split happened.',
    agentAction: 'Inspect tool-specific outcome, warning, truncation, and error fields before claiming success.',
  },
  ...RUNTIME_STATUS_NODE_FIELD_CATALOG,
  workspace: {
    sourceTools: ['get_agent_guidance', 'get_runtime_status'],
    meaning: 'Resolved FONT_SPLIT_ROOT workspace and configuration status.',
    agentAction: 'Confirm paths are inside the intended workspace before reading or writing local fonts.',
  },
  ...GUIDANCE_HEADER_FIELD_CATALOG,
  ...RUNTIME_STATUS_RUNTIME_FIELD_CATALOG,
  ...SOURCE_INPUT_SCAN_RESPONSE_FIELD_CATALOG,
  ...RESULT_SHAPE_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_WARNING_FIELD_CATALOG,
  ...SOURCE_SAFETY_SUMMARY_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_REFERENCE_FIELD_CATALOG,
  ...COMPACT_CHECK_RESPONSE_FIELD_CATALOG,
  ...REAL_CORPUS_CHECK_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_SAFE_WORKFLOW_FIELD_CATALOG,
  ...BATCH_DECISION_RESPONSE_FIELD_CATALOG,
  ...WORKFLOW_SCAN_LIMIT_RESPONSE_FIELD_CATALOG,
  ...INPUT_PREFLIGHT_ROUTE_RESPONSE_FIELD_CATALOG,
  ...SHARED_DRY_RUN_RESPONSE_FIELD_CATALOG,
  ...BATCH_PLAN_RESPONSE_FIELD_CATALOG,
  skippedDuplicates: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Number of equivalent fonts skipped by the selected dedupe policy.',
    agentAction: 'Inspect dedupe mode and plans when representative choice matters.',
  },
  ...INSPECTION_WARNING_RESPONSE_FIELD_CATALOG,
  ...ORGANIZATION_WARNING_RESPONSE_FIELD_CATALOG,
  ...SHARED_RECOMMENDED_NEXT_ACTIONS_RESPONSE_FIELD_CATALOG,
  ...ORGANIZATION_OPERATION_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_DIRECTORY_HANDLING_FIELD_CATALOG,
  ...ORGANIZATION_DIRECTORY_WORKFLOW_RESPONSE_FIELD_CATALOG,
  ...SOURCE_SAFETY_WRITE_SCOPE_RESPONSE_FIELD_CATALOG,
  ...ORGANIZATION_PARSING_RESPONSE_FIELD_CATALOG,
  recommendedBatchOptions: {
    sourceTools: ['organize_font_directory', 'get_agent_guidance'],
    meaning: 'Suggested split_font_batch option fragment from guidance or layout analysis. It is not a complete safe invocation by itself.',
    agentAction: 'Prefer recommendedBatchPreviewArgs for a copyable no-write preview call after organize_font_directory; use this field only as policy overrides after reviewing layout and warnings.',
  },
  ...GUIDANCE_BATCH_RECOMMENDATION_FIELD_CATALOG,
  ...SHARED_BATCH_POLICY_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_IDENTITY_FIELD_CATALOG,
  identityBasis: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Machine-readable basis used to build a font identity key, such as typographic-family-subfamily, opentype-family-subfamily, full-name, postscript-name, family-only, or a fallback basis.',
    agentAction: 'Look up this value in fontIdentityBasisCatalog before claiming semantic equivalence or explaining dedupe results.',
  },
  ...SHARED_BATCH_IDENTITY_EVIDENCE_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_CONFIGURATION_FIELD_CATALOG,
  ...SOURCE_LAYOUT_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_DIRECTORY_WORKFLOW_FIELD_CATALOG,
  ...BATCH_RESULT_RESPONSE_FIELD_CATALOG,
  ...SHARED_PLAN_VISIBILITY_RESPONSE_FIELD_CATALOG,
  ...SHARED_BATCH_WORKFLOW_RESPONSE_FIELD_CATALOG,
  ...BATCH_SKIP_MODE_RESPONSE_FIELD_CATALOG,
  ...SHARED_BATCH_MODE_RESPONSE_FIELD_CATALOG,
  ...BATCH_ERROR_AND_INCREMENTAL_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_WORKFLOW_PRESET_FIELD_CATALOG,
  ...OUTPUT_AUDIT_RESPONSE_FIELD_CATALOG,
};
