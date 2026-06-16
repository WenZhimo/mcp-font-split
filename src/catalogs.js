import { buildToolOptionCatalog } from './tool-option-catalog.js';

export const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);

export const FORMAT_PRIORITY = { '.otf': 0, '.ttf': 1, '.woff2': 2, '.ttc': 3, '.otc': 4, '.woff': 5 };

export const FORMAT_PRIORITY_ORDER = Object.entries(FORMAT_PRIORITY)
  .sort((a, b) => a[1] - b[1])
  .map(([extension]) => extension);

export const WORKFLOW_PRESETS = {
  'safe-preview': {
    description: 'No-write preview for unfamiliar sources. Good first call for agents before any batch write or organization copy.',
    writesBatchFiles: false,
    writesOrganizationFiles: false,
    batch: {
      dryRun: true,
      includeResults: true,
      skipMode: 'manifest',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      batchErrorMode: 'fail-after',
      splitFailureAction: 'single-woff2',
    },
    organize: {
      dryRun: true,
      includePlan: true,
      parseFonts: true,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
  },
  'reviewed-write': {
    description: 'Write-oriented settings after a preview has been reviewed. Batch writes output; organization copies into outputDir only.',
    writesBatchFiles: true,
    writesOrganizationFiles: true,
    batch: {
      dryRun: false,
      includeResults: false,
      skipMode: 'manifest',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      batchErrorMode: 'fail-after',
      splitFailureAction: 'single-woff2',
    },
    organize: {
      dryRun: false,
      includePlan: true,
      parseFonts: true,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
  },
  'structure-first': {
    description: 'Fast no-write structural scan for very large or noisy directories. Metadata-sensitive decisions remain limited.',
    writesBatchFiles: false,
    writesOrganizationFiles: false,
    batch: {
      dryRun: true,
      includeResults: false,
      skipMode: 'manifest',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'same-path',
      batchErrorMode: 'fail-after',
    },
    organize: {
      dryRun: true,
      includePlan: false,
      parseFonts: false,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
  },
  'source-layout': {
    description: 'Prefer source directory names as family/group names. Useful for archive-per-family folder layouts.',
    writesBatchFiles: 'depends-on-dryRun',
    writesOrganizationFiles: 'depends-on-dryRun',
    batch: {
      batchGroupBy: 'source-dir',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
    },
    organize: {
      batchGroupBy: 'source-dir',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
    },
  },
  'metadata-family': {
    description: 'Prefer internal font metadata as family/group names. Useful for flat vendor dumps.',
    writesBatchFiles: 'depends-on-dryRun',
    writesOrganizationFiles: 'depends-on-dryRun',
    batch: {
      batchGroupBy: 'font-family',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
    },
    organize: {
      batchGroupBy: 'font-family',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
    },
  },
  'preserve-all': {
    description: 'Disable pre-processing dedupe while keeping collision-safe numeric names. Useful when every source font file must be kept.',
    writesBatchFiles: 'depends-on-dryRun',
    writesOrganizationFiles: 'depends-on-dryRun',
    batch: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'none',
    },
    organize: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'none',
    },
  },
};

export const WORKFLOW_PRESET_NAMES = Object.keys(WORKFLOW_PRESETS);
export const SKIP_MODES = ['manifest', 'force'];
export const BATCH_GROUP_BY_MODES = ['auto', 'source-dir', 'font-family'];
export const BATCH_NAMING_MODES = ['plain', 'numeric-suffix', 'source-suffix'];
export const BATCH_DEDUPE_MODES = ['none', 'same-path', 'font-identity'];
export const BATCH_ERROR_MODES = ['collect', 'fail-fast', 'fail-after'];
export const OVERSIZED_KERN_ACTIONS = ['preserve', 'strip'];
export const SMALL_GLYPH_ACTIONS = ['subset', 'single-woff2', 'copy-original'];
export const SPLIT_FAILURE_ACTIONS = ['error', 'single-woff2'];
export const GUIDANCE_WORKFLOWS = ['overview', 'single', 'batch', 'inspect', 'organize'];
export const GUIDANCE_DETAIL_LEVELS = ['compact', 'full'];
export const GUIDANCE_SECTION_NAMES = [
  'workspace',
  'tools',
  'defaults',
  'recommendations',
  'option-catalog',
  'identity-catalog',
  'output-catalog',
  'directory-workflows',
  'examples',
  'verification',
  'error-catalog',
  'warning-catalog',
  'field-catalog',
  'safe-templates',
  'response-fields',
  'path-rules',
  'workflow',
];
export const GUIDANCE_COMPACT_SECTION_NAMES = [
  'workspace',
  'tools',
  'defaults',
  'recommendations',
  'option-catalog',
  'identity-catalog',
  'output-catalog',
  'directory-workflows',
  'safe-templates',
  'verification',
  'error-catalog',
  'response-fields',
  'path-rules',
  'workflow',
];
export const GUIDANCE_SECTION_FIELDS = {
  workspace: ['workspace'],
  tools: ['tools', 'toolSafetyQuickReference', 'supportedExtensions'],
  defaults: ['projectStatusNotice', 'defaultPolicies'],
  recommendations: ['recommendedBatchOptions', 'recommendedInspectOptions', 'recommendedOrganizationOptions', 'workflowPresets', 'batchCustomizationQuickReference', 'outputResultShapeQuickReference', 'batchPolicyGuide', 'configurationRecipes', 'unsupportedFileCategoryCatalog', 'fontIdentityBasisCatalog', 'outputStructureCatalog'],
  'directory-workflows': ['directoryOrganizationQuickAnswer', 'directoryHandlingModeCatalog', 'directoryWorkflowDecisionMatrix'],
  examples: ['directoryWorkflowExamples'],
  verification: ['verificationChecklist', 'localVerificationOutputGuide'],
  'error-catalog': ['errorResponseCatalog'],
  'warning-catalog': ['warningCodeCatalog'],
  'field-catalog': ['toolResponseFieldCatalog'],
  'option-catalog': ['toolOptionCatalog'],
  'identity-catalog': ['fontIdentityBasisCatalog'],
  'output-catalog': ['outputStructureCatalog', 'outputResultShapeQuickReference'],
  'safe-templates': ['safeInvocationTemplates'],
  'response-fields': ['responseFieldsToCheck'],
  'path-rules': ['pathRules'],
  workflow: ['recommendedWorkflow', 'nextToolDecisionSummary', 'recommendedWorkflowPlan'],
};

export { FONT_IDENTITY_BASIS_CATALOG } from './font-identity-basis-catalog.js';

export { OUTPUT_STRUCTURE_CATALOG } from './output-structure-catalog.js';

export {
  ALL_TOOL_NAMES,
  TOOL_RESPONSE_FIELD_CATALOG,
} from './tool-response-field-catalog.js';

export const TOOL_OPTION_CATALOG = buildToolOptionCatalog({
  WORKFLOW_PRESET_NAMES,
  SKIP_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
  OVERSIZED_KERN_ACTIONS,
});

export {
  ERROR_RESPONSE_CATALOG,
  WARNING_CODE_CATALOG,
} from './diagnostic-catalogs.js';

export {
  DIRECTORY_HANDLING_MODE_BY_ORGANIZATION_ROUTE,
  DIRECTORY_HANDLING_MODE_CATALOG_ENTRIES,
  DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
  DIRECTORY_HANDLING_SHORT_ANSWER_BY_MODE,
  buildDirectoryHandlingModeCatalog,
} from './directory-handling-catalog.js';

export {
  UNSUPPORTED_FILE_CATEGORY_DETAILS,
  UNSUPPORTED_FILE_EXTENSION_CATEGORIES,
} from './unsupported-file-catalog.js';
