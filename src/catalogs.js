import {
  OUTPUT_AUDIT_PASS_CRITERIA_LIST,
  OUTPUT_AUDIT_REPORT_PASS_ACTION,
} from './output-audit-criteria.js';
import { buildToolOptionCatalog } from './tool-option-catalog.js';

export const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);

export const UNSUPPORTED_FILE_EXTENSION_CATEGORIES = {
  archive: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.br']),
  document: new Set(['.txt', '.md', '.markdown', '.pdf', '.doc', '.docx', '.rtf', '.odt', '.ofl', '.license']),
  image: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tif', '.tiff', '.avif']),
  web: new Set(['.html', '.htm', '.css', '.js', '.mjs', '.cjs']),
  metadata: new Set(['.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.url', '.csv', '.tsv']),
  signature: new Set(['.asc', '.sig']),
  'unsupported-font': new Set(['.eot', '.svg', '.dfont', '.suit', '.fon', '.bdf', '.pcf', '.pfa', '.pfb', '.pfm', '.afm', '.cff', '.cid', '.ttx', '.ufo', '.glyphs']),
};

export const UNSUPPORTED_FILE_CATEGORY_DETAILS = {
  archive: {
    meaning: 'Compressed archives that may contain fonts but are outside this tool layer.',
    handling: 'Reported in summaries only; never extracted, copied, or split.',
  },
  document: {
    meaning: 'Licenses, readme files, and other human-readable package documents.',
    handling: 'Reported and ignored; not copied by directory organization.',
  },
  image: {
    meaning: 'Preview images, screenshots, icons, or other raster assets shipped beside fonts.',
    handling: 'Reported and ignored; not copied by directory organization.',
  },
  web: {
    meaning: 'Web or generated frontend assets such as HTML, CSS, and JavaScript.',
    handling: 'Reported and ignored as source noise; generated split output is audited separately by inspect_split_output.',
  },
  metadata: {
    meaning: 'Package metadata, manifests, config files, links, and tabular sidecar files.',
    handling: 'Reported and ignored unless produced later as tool manifests in an output tree.',
  },
  signature: {
    meaning: 'Detached signature or checksum-adjacent files shipped with downloads.',
    handling: 'Reported and ignored; cryptographic verification is outside this tool.',
  },
  'unsupported-font': {
    meaning: 'Font-adjacent formats that are not supported input formats for this tool.',
    handling: 'Reported and ignored; only .ttf, .otf, .ttc, .otc, .woff, and .woff2 are supported inputs.',
  },
  extensionless: {
    meaning: 'Files with no extension.',
    handling: 'Reported with extension <none> and ignored unless they are renamed to a supported font extension and parse successfully.',
    extensions: ['<none>'],
  },
  other: {
    meaning: 'Unsupported files that do not match a known coarse category.',
    handling: 'Reported and ignored; inspect byExtension and examples before assuming intent.',
    extensions: [],
  },
};

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

export const DIRECTORY_HANDLING_MUST_INSPECT_FIELDS = Object.freeze([
  'layoutDecision',
  'layoutDecision.directoryHandling',
  'layoutDecision.directoryHandling.recommendedMode',
  'sourceSafetyDecision',
  'safetySummary',
  'stagingDirectoryDecision',
  'organizationDecision',
  'sourceLayoutMismatchSummary',
  'sourceLayoutMismatchSummary.decisionChecklist',
  'recommendedNextActions',
  'organizationWarnings',
  'planActionSummary',
]);

export const DIRECTORY_HANDLING_MODE_BY_ORGANIZATION_ROUTE = Object.freeze({
  'rerun-with-higher-maxFiles': 'rerun-organization',
  'rerun-with-font-parsing': 'rerun-organization-with-font-parsing',
  'inspect-organization-errors': 'inspect-organization-errors',
  'decide-on-invalid-fonts': 'resolve-invalid-font-policy',
  'no-copyable-fonts': 'stop-no-copyable-fonts',
  'preview-organized-output': 'preview-organized-output',
  'review-existing-targets': 'inspect-organized-output',
  'review-mixed-layout': 'review-original-input-safe-preview',
  'preview-original-layout': 'preview-original-input',
});

export const DIRECTORY_HANDLING_MODE_CATALOG_ENTRIES = Object.freeze([
  {
    value: 'rerun-organization',
    shortAnswer: 'The scan was truncated; rerun organize_font_directory with a higher maxFiles before deciding how to split.',
    meaning: 'The organizer did not see the whole input tree, so the current route is incomplete.',
    whenSeen: 'organizationDecision.route is rerun-with-higher-maxFiles, usually because maxFilesHit is true.',
    recommendedNextStep: 'Rerun organize_font_directory with a higher maxFiles before choosing direct batch preview or copy-only staging.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'Counts, layoutKind, and ignored-file summaries may describe only the scanned prefix until the rerun completes.',
  },
  {
    value: 'rerun-organization-with-font-parsing',
    shortAnswer: 'This was a structure-only pass; rerun organize_font_directory with font parsing before relying on metadata grouping or identity dedupe.',
    meaning: 'The organizer intentionally skipped font parsing, so metadata-dependent grouping and identity dedupe are limited.',
    whenSeen: 'organizationDecision.route is rerun-with-font-parsing after a structure-first or parseFonts:false pass.',
    recommendedNextStep: 'Rerun organize_font_directory with parseFonts:true or workflowPreset safe-preview before using font-family grouping, invalid-font counts, or identity dedupe.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'validFontCount and invalidFontCount can be null, not zero, because parsing was skipped.',
  },
  {
    value: 'inspect-organization-errors',
    shortAnswer: 'The organization run recorded errors; inspect them before choosing a split or staging route.',
    meaning: 'The organizer hit one or more errors that may change which fonts can be copied or split.',
    whenSeen: 'organizationDecision.route is inspect-organization-errors.',
    recommendedNextStep: 'Inspect organization errors and warnings, then rerun or adjust policy before writing or batch-splitting.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'ok can still be true for collected-error modes; errorCount and organizationWarnings decide whether the route is trustworthy.',
  },
  {
    value: 'resolve-invalid-font-policy',
    shortAnswer: 'Some supported-extension files could not be parsed; decide whether to preserve invalid font-like files before treating the route as ready.',
    meaning: 'At least one supported-extension file failed metadata parsing, so the copy/split policy must decide whether to keep or skip it.',
    whenSeen: 'organizationDecision.route is decide-on-invalid-fonts.',
    recommendedNextStep: 'Review invalid font counts and warnings; choose copyInvalidFonts only if preserving broken or font-like files is intentional.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'Unsupported files are ignored separately; this mode is about supported extensions that failed font parsing.',
  },
  {
    value: 'stop-no-copyable-fonts',
    shortAnswer: 'No copyable supported fonts were found for the current policy; do not split until the input or policy changes.',
    meaning: 'The current input/policy combination produced no fonts that should be copied or split.',
    whenSeen: 'organizationDecision.route is no-copyable-fonts.',
    recommendedNextStep: 'Stop and inspect supportedFontCount, validFontCount, invalidFontCount, unsupportedFileSummary, and policy choices before retrying.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'A noisy corpus can contain many files while still producing zero copyable supported fonts under the selected policy.',
  },
  {
    value: 'preview-organized-output',
    shortAnswer: 'A copy-only staging directory has been written; run split_font_batch safe-preview on that organized output before any split write.',
    meaning: 'The next split input should be the already-created organized output directory.',
    whenSeen: 'organizationDecision.route is preview-organized-output after a reviewed organize run copied files into outputDir.',
    recommendedNextStep: 'Run split_font_batch with workflowPreset safe-preview against the organized output, then audit split output after any reviewed write.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'The staging copy may already exist, but the split itself still needs a no-write safe-preview before a reviewed write.',
  },
  {
    value: 'inspect-organized-output',
    shortAnswer: 'No new files were copied; inspect the organized output or existing targets before using them as split input.',
    meaning: 'The organizer found existing target files instead of producing new copies.',
    whenSeen: 'organizationDecision.route is review-existing-targets.',
    recommendedNextStep: 'Inspect the organized output or existing target paths, then decide whether to reuse, overwrite, or rerun with different options.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'copiedCount can be zero because targets already exist, not because the source tree was changed.',
  },
  {
    value: 'review-original-input-safe-preview',
    shortAnswer: 'Mixed root and nested fonts were detected; safe-preview the original input and review grouping, or copy a staging directory if the user wants a cleaner source layout.',
    meaning: 'The original source can be previewed, but mixed layout makes grouping choices easy to misread.',
    whenSeen: 'organizationDecision.route is review-mixed-layout.',
    recommendedNextStep: 'Run split_font_batch safe-preview with the suggested original-input args, or use copy-only organization when a stable staging tree is desired.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'This is a route hint, not proof that mixed source folders already match the desired output structure.',
  },
  {
    value: 'preview-original-input',
    shortAnswer: 'The original input can be used directly for split_font_batch safe-preview; copy-only staging is optional.',
    meaning: 'The current source layout is suitable enough to preview batch splitting without first copying a staging directory.',
    whenSeen: 'organizationDecision.route is preview-original-layout.',
    recommendedNextStep: 'Run split_font_batch with workflowPreset safe-preview using the suggested original-input args.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'Direct preview is still no-write planning; reviewed write and output audit remain separate required steps.',
  },
  {
    value: 'review-organization-decision',
    shortAnswer: 'Review the organization decision before choosing direct preview, copy-only staging, or a rerun.',
    meaning: 'Fallback mode for an organizationDecision route without a more specific directory-handling mode.',
    whenSeen: 'organizationDecision.route is missing or not recognized by the current catalog.',
    recommendedNextStep: 'Inspect organizationDecision, warnings, planActionSummary, and source safety fields before choosing the next tool.',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    mustInspectFields: DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
    nonIntuitiveBehavior: 'Fallback modes require extra caution because the route may come from newer behavior than this client expected.',
  },
]);

export const DIRECTORY_HANDLING_SHORT_ANSWER_BY_MODE = Object.freeze(Object.fromEntries(
  DIRECTORY_HANDLING_MODE_CATALOG_ENTRIES.map((entry) => [entry.value, entry.shortAnswer]),
));

export function buildDirectoryHandlingModeCatalog() {
  return Object.fromEntries(DIRECTORY_HANDLING_MODE_CATALOG_ENTRIES.map((entry) => [
    entry.value,
    {
      ...entry,
      mustInspectFields: [...entry.mustInspectFields],
    },
  ]));
}

export const FONT_IDENTITY_BASIS_CATALOG = Object.freeze({
  'typographic-family-subfamily': {
    basis: 'typographic-family-subfamily',
    priority: 1,
    nameIds: [16, 17],
    semanticIdentity: true,
    confidence: 'highest',
    meaning: 'Identity key came from a complete OpenType typographic family/subfamily pair.',
    agentAction: 'Treat duplicates with this basis as semantic font-identity matches unless other response warnings say parsing or dedupe was limited.',
  },
  'opentype-family-subfamily': {
    basis: 'opentype-family-subfamily',
    priority: 2,
    nameIds: [1, 2],
    semanticIdentity: true,
    confidence: 'high',
    meaning: 'Identity key came from a complete OpenType family/subfamily pair because a complete typographic pair was not available.',
    agentAction: 'Treat as semantic identity evidence; disclose that the tool used name IDs 1/2 rather than typographic name IDs 16/17 if the exact basis matters.',
  },
  'full-name': {
    basis: 'full-name',
    priority: 3,
    nameIds: [4],
    semanticIdentity: true,
    confidence: 'medium',
    meaning: 'Identity key came from OpenType full font name because complete family/subfamily pairs were unavailable.',
    agentAction: 'Use as usable semantic evidence, but prefer family/subfamily basis when comparing families with many styles.',
  },
  'postscript-name': {
    basis: 'postscript-name',
    priority: 4,
    nameIds: [6],
    semanticIdentity: true,
    confidence: 'medium',
    meaning: 'Identity key came from OpenType PostScript name because earlier name records were unavailable.',
    agentAction: 'Use as usable semantic evidence, but inspect duplicate examples when naming conventions vary by source.',
  },
  'typographic-family': {
    basis: 'typographic-family',
    priority: 5,
    nameIds: [16],
    semanticIdentity: true,
    confidence: 'low',
    meaning: 'Only typographic family was available, so style/subfamily is not part of the identity key.',
    agentAction: 'Treat duplicate decisions with this basis as lower confidence and inspect duplicateExamples when style preservation matters.',
  },
  'opentype-family': {
    basis: 'opentype-family',
    priority: 6,
    nameIds: [1],
    semanticIdentity: true,
    confidence: 'low',
    meaning: 'Only OpenType family was available, so style/subfamily is not part of the identity key.',
    agentAction: 'Treat duplicate decisions with this basis as lower confidence and inspect duplicateExamples when style preservation matters.',
  },
  'path-stem': {
    basis: 'path-stem',
    semanticIdentity: false,
    confidence: 'path-only',
    meaning: 'same-path dedupe compared normalized source path stems, not font metadata.',
    agentAction: 'Do not report this as semantic font identity; it only proves path/stem-level grouping.',
  },
  'path-fallback': {
    basis: 'path-fallback',
    semanticIdentity: false,
    confidence: 'fallback',
    meaning: 'font-identity was requested but this file lacked a usable identity key, so the tool fell back to the source path stem.',
    agentAction: 'Disclose that semantic identity dedupe was incomplete and inspect identityKeyMissingCount/pathFallbackUsed.',
  },
  missing: {
    basis: 'missing',
    semanticIdentity: false,
    confidence: 'none',
    meaning: 'No identity key was available for the evidence item.',
    agentAction: 'Use missingIdentityCount and pathFallbackUsed before claiming identity dedupe was complete.',
  },
  'not-applicable': {
    basis: 'not-applicable',
    semanticIdentity: false,
    confidence: 'none',
    meaning: 'Dedupe was disabled, so identity basis evidence does not apply.',
    agentAction: 'Do not infer duplicates or semantic equivalence from this basis.',
  },
  unknown: {
    basis: 'unknown',
    semanticIdentity: false,
    confidence: 'unknown',
    meaning: 'The identity key could not be parsed into a known basis.',
    agentAction: 'Inspect the raw response and avoid strong identity-dedupe claims.',
  },
});

export const OUTPUT_STRUCTURE_CATALOG = Object.freeze({
  summaryType: 'output-structure-catalog',
  purpose: 'Machine-readable companion for inspect_split_output outputRoleDecision, outputStructureDecision, and structureSummary fields.',
  passCriteria: OUTPUT_AUDIT_PASS_CRITERIA_LIST,
  nonIntuitiveBehavior: [
    'ok:true means inspect_split_output ran; it is not proof that the output tree structure passed.',
    'outputRoleDecision can stop the audit when outDir is organizer staging rather than generated split output.',
    'includeFiles:false and includeFamilies:false can hide large arrays while still running structureSummary checks.',
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
      agentAction: 'Inspect outputRoleDecision, outputStructureDecision.issueCodes, auditBlockingReasons, structureSummary.issues, unexpectedFileExamples, and entryIssueExamples before reporting completion.',
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
      agentAction: 'Inspect structureSummary.issues, unexpectedDepthFileCount, and unexpectedFileExamples before deciding whether to regenerate or move outputs.',
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
      agentAction: 'Inspect unexpectedDepthFileCount and unexpectedFileExamples, then regenerate or choose the correct output root.',
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
      agentAction: 'Inspect unexpectedFileExamples and confirm whether outDir points one level too high or too low.',
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

export const WARNING_CODE_CATALOG = {
  'dry-run-no-write': {
    sources: ['batchWarnings'],
    severity: 'info',
    suggestedAction: 'Treat the response as a preview only; rerun with dryRun:false after reviewing planned output.',
  },
  'input-scan-truncated': {
    sources: ['batchWarnings', 'inspectionWarnings', 'organizationWarnings'],
    severity: 'action-required',
    suggestedAction: 'Rerun with a higher maxFiles before trusting counts, plans, or audit summaries.',
  },
  'batch-limit-truncated': {
    sources: ['batchWarnings'],
    severity: 'warning',
    suggestedAction: 'Increase limit or acknowledge that only the selected subset of deduplicated fonts was processed.',
  },
  'batch-plan-omitted': {
    sources: ['batchWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeResults:true when a dry-run plan must be inspected.',
  },
  'batch-results-omitted': {
    sources: ['batchWarnings'],
    severity: 'info',
    suggestedAction: 'Use summary counts for large runs, or rerun with includeResults:true when per-font results are needed.',
  },
  'existing-output-skipped': {
    sources: ['batchWarnings'],
    severity: 'warning',
    suggestedAction: 'Inspect skipMode and manifests; use skipMode:force only when reprocessing existing output is intentional.',
  },
  'errors-collected': {
    sources: ['batchWarnings'],
    severity: 'action-required',
    suggestedAction: 'Inspect errors[] before claiming the batch fully succeeded; use fail-after for stricter automation.',
  },
  'input-files-omitted': {
    sources: ['inspectionWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeFiles:true if per-font inspection details are needed.',
  },
  'invalid-fonts-found': {
    sources: ['inspectionWarnings'],
    severity: 'warning',
    suggestedAction: 'Inspect invalidFonts[] or files[] before processing; decide whether broken font-like files should be preserved.',
  },
  'font-identity-missing': {
    sources: ['inspectionWarnings'],
    severity: 'warning',
    suggestedAction: 'Expect identity dedupe to fall back for those fonts; inspect files[] when dedupe precision matters.',
  },
  'output-scan-truncated': {
    sources: ['inspectionWarnings'],
    severity: 'action-required',
    suggestedAction: 'Rerun inspect_split_output with a higher maxFiles before treating the audit as complete.',
  },
  'output-files-omitted': {
    sources: ['inspectionWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeFiles:true if flat output file details are needed.',
  },
  'output-families-omitted': {
    sources: ['inspectionWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeFamilies:true if structured family output details are needed.',
  },
  'missing-manifests': {
    sources: ['inspectionWarnings'],
    severity: 'warning',
    suggestedAction: 'Treat manifest-free output entries as conservatively inferred; rerun or regenerate output with split-meta.json manifests for strict audits.',
  },
  'output-structure-issues': {
    sources: ['inspectionWarnings'],
    severity: 'action-required',
    suggestedAction: 'Inspect structureSummary.conforms, issues[], and unexpectedFileExamples[] before treating generated output as valid.',
  },
  'organized-staging-not-split-output': {
    sources: ['inspectionWarnings'],
    severity: 'action-required',
    suggestedAction: 'Inspect this directory as source-like staging with inspect_font_inputs, then run split_font_batch safe-preview before auditing generated split output.',
  },
  'organization-dry-run': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'Review planActionSummary, plan[], and recommendedNextActions before rerunning with dryRun:false.',
  },
  'organization-writes-output': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'Confirm writesOutputTree and mayOverwriteOutputTree; source files are still preserved.',
  },
  'font-parsing-skipped': {
    sources: ['organizationWarnings'],
    severity: 'warning',
    suggestedAction: 'Rerun with parseFonts:true before relying on invalid-font counts, glyph counts, identity dedupe, or metadata grouping.',
  },
  'output-overwrite-enabled': {
    sources: ['organizationWarnings'],
    severity: 'action-required',
    suggestedAction: 'Confirm overwriting files in outputDir is acceptable before proceeding.',
  },
  'unsupported-files-ignored': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'No action needed unless non-font assets must be preserved separately.',
  },
  'invalid-fonts-skipped': {
    sources: ['organizationWarnings'],
    severity: 'warning',
    suggestedAction: 'Use copyInvalidFonts:true only when preserving broken font-like files is intentional.',
  },
  'duplicate-fonts-skipped': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'Inspect plan[] when representative choice matters; adjust batchDedupeMode if duplicates should be kept.',
  },
  'mixed-layout-detected': {
    sources: ['organizationWarnings'],
    severity: 'warning',
    suggestedAction: 'Review layout and recommendedBatchPreviewArgs before direct batch splitting.',
  },
  'output-inside-input': {
    sources: ['batchWarnings', 'organizationWarnings'],
    severity: 'action-required',
    suggestedAction: 'Use the nested output directory intentionally as a later input or exclude it from future broad scans.',
  },
};

export const ERROR_RESPONSE_CATALOG = {
  configurationError: {
    errorName: 'FontSplitConfigurationError',
    errorType: 'configuration-error',
    detailsSummaryType: 'configuration-error',
    emittedWhen: 'An explicit enum, boolean, or numeric option is invalid in a direct module call or any path that reaches the core validator.',
    mcpResponseShape: {
      isError: true,
      contentType: 'text',
      jsonTextWhenDetailsPresent: true,
      fields: ['ok', 'error', 'name', 'errorType', 'details'],
    },
    detailsFields: [
      'summaryType',
      'optionName',
      'received',
      'allowedValues',
      'expectedType',
      'min',
      'max',
      'defaultWhenOmitted',
      'omitForDefaultBehavior',
    ],
    agentAction: 'Treat this as caller configuration failure. Do not retry the same value; either omit the option for the documented default or choose one of the allowed values / expected types.',
    nonIntuitiveBehavior: 'Invalid explicit values are not interpreted as a request for defaults.',
  },
  batchSplitError: {
    errorName: 'BatchSplitError',
    errorType: 'batch-split-error',
    emittedWhen: 'split_font_batch uses fail-fast or fail-after and at least one selected font fails processing.',
    mcpResponseShape: {
      isError: true,
      contentType: 'text',
      jsonTextWhenDetailsPresent: true,
      fields: ['ok', 'error', 'name', 'errorType', 'details'],
    },
    detailsFields: ['mode', 'errors', 'summary'],
    agentAction: 'Parse the JSON text, inspect every details.errors[] entry and details.summary, then resolve or disclose failures before claiming batch success.',
  },
  plainError: {
    errorName: 'Error',
    emittedWhen: 'An error has no structured details attached.',
    mcpResponseShape: {
      isError: true,
      contentType: 'text',
      plainTextWhenNoDetails: true,
      fields: ['error-message-text'],
    },
    agentAction: 'Treat the text as a failure message. If structured recovery is needed, reproduce through a path that attaches details or inspect logs/context.',
  },
};
