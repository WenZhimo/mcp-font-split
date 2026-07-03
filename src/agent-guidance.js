import {
  ERROR_RESPONSE_CATALOG,
  FONT_IDENTITY_BASIS_CATALOG,
  FONT_EXTENSIONS,
  GUIDANCE_WORKFLOWS,
  OUTPUT_STRUCTURE_CATALOG,
  TOOL_OPTION_CATALOG,
  TOOL_RESPONSE_FIELD_CATALOG,
  WARNING_CODE_CATALOG,
  buildDirectoryHandlingModeCatalog,
} from './catalogs.js';
import { workspaceRoot } from './path-utils.js';
import {
  buildProjectStatusNotice,
  buildUnsupportedFileCategoryCatalog,
  buildGuidanceView,
  buildWorkflowPresetCatalog,
  selectGuidanceSections,
} from './guidance.js';
import { buildOutputResultShapeQuickReference } from './output-result-shape-quick-reference.js';
import { buildToolSafetyQuickReference } from './tool-safety-quick-reference.js';
import { buildDirectoryOrganizationQuickAnswer } from './directory-organization-quick-answer.js';
import { attachSourceLayoutDecisionChecklistFields } from './guidance-inspect-fields.js';
import { buildNextToolDecisionSummary } from './next-tool-decision-summary.js';
import { SAFE_INVOCATION_TEMPLATES } from './safe-invocation-templates.js';
import { buildRecommendedWorkflowPlan } from './workflow-plan.js';
import {
  BATCH_POLICY_GUIDE,
  buildBatchCustomizationQuickReference,
} from './batch.js';
import {
  buildAgentPathRules,
  buildRecommendedWorkflowSteps,
} from './agent-workflow-guidance.js';
import { AGENT_RESPONSE_FIELDS_TO_CHECK } from './agent-response-fields-to-check.js';
import {
  buildLocalVerificationOutputGuide,
  buildVerificationChecklist,
} from './local-verification-guidance.js';
import {
  buildDirectoryWorkflowDecisionMatrix,
  buildDirectoryWorkflowExamples,
} from './directory-workflow-guidance.js';
import { buildConfigurationRecipes } from './configuration-recipes-guidance.js';

export function getAgentGuidance(args = {}) {
  const workflow = GUIDANCE_WORKFLOWS.includes(args.workflow) ? args.workflow : 'overview';
  const guidanceView = buildGuidanceView(args);
  const configuredRoot = process.env.FONT_SPLIT_ROOT || null;
  const root = workspaceRoot();
  const verificationChecklist = buildVerificationChecklist();
  const localVerificationOutputGuide = buildLocalVerificationOutputGuide();
  const directoryWorkflowDecisionMatrix = buildDirectoryWorkflowDecisionMatrix();
  const directoryHandlingModeCatalog = buildDirectoryHandlingModeCatalog();
  const directoryWorkflowExamples = buildDirectoryWorkflowExamples();
  const configurationRecipes = buildConfigurationRecipes();

  const guidance = {
    ok: true,
    purpose: 'AI-agent guidance for using mcp-font-split safely and predictably.',
    workflow,
    agentOptimized: true,
    guidanceView,
    workspace: {
      root,
      fontSplitRootConfigured: configuredRoot !== null,
      configuredRoot,
      relativePathBase: 'FONT_SPLIT_ROOT',
    },
    tools: [
      { name: 'get_agent_guidance', useWhen: 'Orient an AI coding assistant before choosing a font-splitting workflow.' },
      { name: 'get_runtime_status', useWhen: 'Check workspace, Node engine compatibility, mcp-font-split package, cn-font-split package/runtime, and WASM availability without writing files.' },
      { name: 'inspect_font_inputs', useWhen: 'Preflight source fonts without writing output.' },
      { name: 'organize_font_directory', useWhen: 'Plan or copy-organize a mismatched font directory layout. Defaults to dryRun true and never moves or deletes source files.' },
      { name: 'split_font', useWhen: 'Process one known font file.' },
      { name: 'split_font_batch', useWhen: 'Scan, dedupe, name, skip-check, and process many fonts.' },
      { name: 'inspect_split_output', useWhen: 'Audit generated output structure and manifests.' },
    ],
    toolSafetyQuickReference: buildToolSafetyQuickReference(),
    outputResultShapeQuickReference: buildOutputResultShapeQuickReference(),
    supportedExtensions: [...FONT_EXTENSIONS],
    projectStatusNotice: buildProjectStatusNotice(),
    defaultPolicies: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      batchErrorMode: 'fail-after',
      skipMode: 'manifest',
      inspectInputMaxFiles: 50000,
      batchMaxFiles: 5000,
      outputInspectMaxFiles: 200000,
      organizeDryRun: true,
      organizeOutputDir: 'organized-fonts',
      organizeSourceDestructive: false,
    },
    recommendedBatchOptions: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      skipMode: 'manifest',
      batchErrorMode: 'fail-after',
      includeResults: false,
      splitFailureAction: 'single-woff2',
    },
    recommendedInspectOptions: {
      includeFiles: false,
      includeFamilies: false,
      maxFiles: 200000,
    },
    recommendedOrganizationOptions: {
      dryRun: true,
      includePlan: true,
      parseFonts: true,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
    workflowPresets: buildWorkflowPresetCatalog(),
    batchCustomizationQuickReference: buildBatchCustomizationQuickReference(),
    directoryOrganizationQuickAnswer: buildDirectoryOrganizationQuickAnswer(),
    batchPolicyGuide: BATCH_POLICY_GUIDE,
    configurationRecipes,
    fontIdentityBasisCatalog: FONT_IDENTITY_BASIS_CATALOG,
    outputStructureCatalog: OUTPUT_STRUCTURE_CATALOG,
    unsupportedFileCategoryCatalog: buildUnsupportedFileCategoryCatalog(),
    directoryHandlingModeCatalog,
    directoryWorkflowDecisionMatrix,
    directoryWorkflowExamples,
    verificationChecklist,
    localVerificationOutputGuide,
    errorResponseCatalog: ERROR_RESPONSE_CATALOG,
    warningCodeCatalog: WARNING_CODE_CATALOG,
    toolResponseFieldCatalog: TOOL_RESPONSE_FIELD_CATALOG,
    toolOptionCatalog: TOOL_OPTION_CATALOG,
    safeInvocationTemplates: SAFE_INVOCATION_TEMPLATES,
    nextToolDecisionSummary: buildNextToolDecisionSummary(workflow),
    responseFieldsToCheck: AGENT_RESPONSE_FIELDS_TO_CHECK,
    pathRules: buildAgentPathRules(),
    recommendedWorkflow: buildRecommendedWorkflowSteps(workflow),
    recommendedWorkflowPlan: buildRecommendedWorkflowPlan(workflow),
  };
  return selectGuidanceSections(
    attachSourceLayoutDecisionChecklistFields(guidance),
    guidanceView.sectionsIncluded,
  );
}
