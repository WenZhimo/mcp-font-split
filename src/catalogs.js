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
  passCriteria: [
    'outputRoleDecision.auditAppliesToThisDirectory is not false',
    'outputStructureDecision.status is pass',
    'auditStatus is pass',
    'auditPassed is true',
    'structureSummary.conforms is true',
    'maxFilesHit is false',
    'inspectionWarnings contains no action-required output structure or truncation warnings',
  ],
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
      agentAction: 'You may report the output structure audit as passed only when outputRoleDecision, outputStructureDecision.status, auditStatus, auditPassed, structureSummary.conforms, and maxFilesHit all satisfy the pass criteria.',
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
  node: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Node.js runtime details, including whether the current version satisfies package.json engines.',
    agentAction: 'If node.ok is false, handle recommendedActions before processing fonts.',
  },
  workspace: {
    sourceTools: ['get_agent_guidance', 'get_runtime_status'],
    meaning: 'Resolved FONT_SPLIT_ROOT workspace and configuration status.',
    agentAction: 'Confirm paths are inside the intended workspace before reading or writing local fonts.',
  },
  guidanceView: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Summary of get_agent_guidance response shaping, including detailLevel, included sections, omitted sections, and available sections.',
    agentAction: 'Use this to decide whether to request full guidance or additional sections before relying on omitted catalogs or examples.',
  },
  projectStatusNotice: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable pre-release status and change policy for this package.',
    agentAction: 'Use current repository code, current get_agent_guidance, live MCP schema, and current API docs as authoritative; do not preserve stale behavior solely for forward compatibility before formal release.',
  },
  toolSafetyQuickReference: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Compact per-tool safety table describing default writes, source-destructive behavior, copy-only modes, and fields to inspect.',
    agentAction: 'Use this to answer source-destructive and write-scope questions before choosing a tool; then verify sourceSafetyDecision and safetySummary on actual write-capable responses.',
  },
  outputResultShapeQuickReference: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Compact result-shape matrix for interpreting split_font and split_font_batch outcomes such as subset, single-woff2 fallback, copy-original, skipped existing output, and collected batch errors.',
    agentAction: 'Use it before reporting success so ok:true is not mistaken for proof of normal multi-subset web-font output.',
  },
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
  supportedFontCount: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Number of scanned files with supported font extensions.',
    agentAction: 'Use with maxFilesHit and warning fields before trusting source coverage.',
  },
  unsupportedFileSummary: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact summary of all ignored non-font files, including precise extension counts, coarse categories, extensionless files, and example paths.',
    agentAction: 'Use this when source directories include archives, docs, generated files, or other noise that will not be organized or split; inspect the subfields before judging corpus coverage.',
  },
  unsupportedFileDecision: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact machine-readable triage of ignored non-font files derived from unsupportedFileSummary.',
    agentAction: 'Use this first to see whether ignored files exist, whether archive files or non-.zip/.txt noise are present, and whether the tool will extract, copy, or split those files; use unsupportedFileSummary for exact evidence.',
  },
  inputCountGuide: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact machine-readable guide for interpreting source scan counts, maxFiles truncation, omitted file details, and unsupported-file handling.',
    agentAction: 'Check this before treating count fields as complete; if countCompleteness is truncated, rerun with a higher maxFiles before reporting corpus totals.',
  },
  'unsupportedFileSummary.total': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Total number of scanned files ignored because their extensions are not supported font formats.',
    agentAction: 'Use with maxFilesHit before treating the ignored-file count as complete.',
  },
  'unsupportedFileSummary.byExtension': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Exact ignored-file counts by normalized extension, with <none> for extensionless files.',
    agentAction: 'Use this when deciding whether unexpected file types are present; do not infer that archives are processed just because they are counted.',
  },
  'unsupportedFileSummary.byCategory': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Coarse ignored-file categories for agent triage, such as archive, document, image, web, metadata, signature, unsupported-font, extensionless, and other.',
    agentAction: 'Use this for noisy real corpora where exact extensions are too fragmented; archive entries are reported but still ignored.',
  },
  'unsupportedFileSummary.categoryDetails': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Category counts enriched with category meaning, representative extensions, and handling behavior.',
    agentAction: 'Use this to explain ignored archives, docs, images, unsupported font-adjacent files, and extensionless files without separately calling get_agent_guidance.',
  },
  'unsupportedFileSummary.handlingSummary': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Response-local handling policy for unsupported files in the current scan.',
    agentAction: 'Use this to confirm unsupported files are reported for context only; archives are not extracted and unsupported files are not copied or split.',
  },
  'unsupportedFileSummary.examples': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Small sample of ignored file paths, relative to the workspace when possible.',
    agentAction: 'Use examples to explain what was ignored without expanding every non-font file in a large corpus.',
  },
  'unsupportedFileSummary.examplesTruncated': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Whether more ignored-file examples existed than were returned.',
    agentAction: 'If true and exact examples matter, inspect the source tree directly or rerun with a focused smaller input directory.',
  },
  validFontCount: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Number of supported-extension files whose basic font metadata was parsed successfully.',
    agentAction: 'Treat null as unknown when metadata parsing was intentionally skipped.',
  },
  invalidFontCount: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Number of supported-extension files that failed font metadata parsing.',
    agentAction: 'Inspect invalidFonts[] or organization warnings before deciding whether broken font-like files should be preserved.',
  },
  missingIdentityCount: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Number of parseable fonts without a usable batch identity key.',
    agentAction: 'Expect identity dedupe to fall back for these fonts when precision matters.',
  },
  resultType: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Specific processing result classification, including subset, fallback, and copy-original cases.',
    agentAction: 'Use this instead of ok alone when reporting what was produced.',
  },
  outputMode: {
    sourceTools: ['split_font', 'split_font_batch', 'inspect_split_output'],
    meaning: 'Broad output category: subset, single-woff2, or copy-original.',
    agentAction: 'Disclose non-subset modes because they are not normal multi-subset output.',
  },
  performedSplit: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'True only when normal cn-font-split multi-subset processing actually ran.',
    agentAction: 'Do not claim multi-subset splitting when this is false.',
  },
  usedFallback: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'True when the result used a fallback path such as single-WOFF2 output.',
    agentAction: 'Tell the user fallback output was used and inspect warnings.',
  },
  skipped: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Per-font signal that normal multi-subset splitting was intentionally bypassed, such as for small-glyph single-WOFF2 fallback or copy-original handling.',
    agentAction: 'Interpret together with outputMode, resultType, usedFallback, and skipReason; do not confuse it with batch existing-output skip counters.',
  },
  skipReason: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Per-font or dry-run plan reason for bypassing normal processing or for a skip decision, such as small-glyph fallback, copy-original, manifest, missing-manifest, stale-manifest, or force.',
    agentAction: 'Use this to explain why a font was not normally split; if the reason is manifest, audit existing output or use skipMode force only when reprocessing is intentional.',
  },
  warnings: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Per-font warnings from processing one selected font.',
    agentAction: 'Review before treating a font as cleanly processed.',
  },
  manifestPath: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Path to the split-meta.json manifest for a processed font entry.',
    agentAction: 'Use this as the strongest per-font evidence of what options and source file produced the output.',
  },
  warningCodeCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of machine-readable warning codes emitted by batch, inspection, and organization tools.',
    agentAction: 'Use it to interpret warning severity and choose follow-up actions.',
  },
  safetySummary: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact source/output safety summary for batch or directory organization calls.',
    agentAction: 'Inspect this before treating a call as non-destructive, dry-run only, or output-writing.',
  },
  sourceSafetyDecision: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Top-level compact answer for whether source font files are moved, deleted, or rewritten, whether the call writes output, and whether output is inside the input tree.',
    agentAction: 'Use this as the first source-safety triage field, then inspect safetySummary, writesSourceTree, writesOutputTree, outputTreeInsideInputTree, and output audit fields when output was written.',
  },
  toolResponseFieldCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of important response fields, their source tools, meanings, and suggested agent actions.',
    agentAction: 'Use it as the runtime API map before interpreting tool responses.',
  },
  toolOptionCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of high-impact tool input options, defaults, allowed values, safe customization routes, and non-intuitive behavior.',
    agentAction: 'Use it before overriding defaults; prefer workflowPreset first, then add the smallest explicit option override and inspect the listed response fields.',
  },
  errorResponseCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of structured MCP error response shapes, including configuration errors, batch split errors, and plain unstructured errors.',
    agentAction: 'Use it to decide whether to parse an MCP error text body as JSON and which details fields must be inspected before retrying or reporting failure.',
  },
  localVerificationOutputGuide: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable guide for interpreting local maintenance smoke output, including check:compact and smoke:real-corpus-suite.',
    agentAction: 'Use this after running local maintenance gates to decide whether compact standard checks passed and which real-corpus output fields prove the representative reliability gate passed.',
  },
  'localVerificationOutputGuide.completionReportGuide': {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Nested guide for reporting local verification results without overstating representative real-corpus coverage.',
    agentAction: 'Use requiredClaims, forbiddenClaims, and conciseReportTemplate before writing a phase summary after local gates pass.',
  },
  'localVerificationOutputGuide.completionReportGuide.requiredClaims': {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Evidence-backed claims an agent should include when summarizing completed local compact and real-corpus gates.',
    agentAction: 'Map each claim to its evidenceField instead of reporting ok:true alone.',
  },
  'localVerificationOutputGuide.completionReportGuide.forbiddenClaims': {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Claims an agent must avoid after representative real-corpus testing, such as implying every font or directory was manually accepted.',
    agentAction: 'Check this before final summaries so representative coverage is not overstated.',
  },
  'localVerificationOutputGuide.completionReportGuide.conciseReportTemplate': {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Low-noise report template for local verification summaries, including compact check status, real-corpus counts, archive scope, tool coverage, and output audit status.',
    agentAction: 'Use this shape when the user asks for a stage summary or verification result.',
  },
  'compact-check-result.ok': {
    sourceTools: ['npm run check:compact'],
    meaning: 'Boolean pass/fail result from the compact local syntax/smoke gate wrapper.',
    agentAction: 'Require true before treating the standard local gate as passed; if false, inspect failedStepId and steps[].',
  },
  'compact-check-result.failedStepId': {
    sourceTools: ['npm run check:compact'],
    meaning: 'Identifier of the failed compact-check child step, or null when every step passed.',
    agentAction: 'Use this to rerun the failing npm script directly or inspect the corresponding step tail.',
  },
  'compact-check-result.steps': {
    sourceTools: ['npm run check:compact'],
    meaning: 'Per-step compact check metadata, including ok, exitCode, elapsedMs, output byte counts, and stdout/stderr tails only for failing steps.',
    agentAction: 'Use failed step tails for quick triage; rerun the failed npm script directly for full output.',
  },
  'coverageSummary.archiveHandlingScope': {
    sourceTools: ['npm run smoke:real-corpus-suite'],
    meaning: 'Machine-readable scope statement for archive files in the real-corpus suite: archives are counted as ignored files, but archive contents are not extracted, scanned, or counted as tested fonts.',
    agentAction: 'Use this field before reporting real-corpus coverage when the corpus contains zip/rar/7z/tar files; do not imply fonts inside archives were tested unless they were extracted outside this tool and scanned as normal files.',
  },
  safeInvocationTemplates: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable safe starting calls for common AI-agent workflows. Each template includes inspectFields and successCriteria.',
    agentAction: 'Choose the closest template, customize placeholder paths and limits, inspect the listed fields, and satisfy successCriteria before proceeding.',
  },
  recommendedWorkflowPlan: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Ordered workflow plan that composes safeInvocationTemplates into phases for the selected guidance workflow. Each step and decision point includes inspectFields and successCriteria.',
    agentAction: 'Follow the ordered steps, inspect each listed field, and satisfy successCriteria before advancing from preview to write or reporting completion.',
  },
  nextToolDecisionSummary: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Compact "which tool should I call next?" route summary for AI agents. It references safeInvocationTemplates instead of duplicating full workflow rules.',
    agentAction: 'Use it as the first routing index, then open the referenced template or response fields and satisfy successCriteria before writing or reporting completion.',
  },
  'nextToolDecisionSummary.quickStartCallExamples': {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Template-derived minimal call examples for the most common safe agent routes, including placeholder paths, fields to inspect, and success criteria.',
    agentAction: 'Use these as quick copyable starts, customize placeholder paths and limits, then verify the referenced inspectFields and successCriteria.',
  },
  'nextToolDecisionSummary.workflowQuickStart': {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Workflow-specific pointer to the recommended quick-start call example, plus alternates for common branch points.',
    agentAction: 'Use recommendedCallExample as the first copyable call for the selected workflow, then switch to alternates only when the user intent or inspected response requires that route.',
  },
  batchWarnings: {
    sourceTools: ['split_font_batch'],
    meaning: 'Summary-level batch notices with machine-readable codes.',
    agentAction: 'Inspect every action-required or warning item before claiming the batch fully succeeded.',
  },
  batchWarningCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of batchWarnings entries.',
    agentAction: 'Use as a compact signal that batchWarnings needs attention.',
  },
  batchDecision: {
    sourceTools: ['split_font_batch'],
    meaning: 'Compact machine-readable route recommendation after a batch run, such as review a dry-run plan, rerun with a higher maxFiles, inspect errors, audit written output, or handle an empty batch.',
    agentAction: 'Use this to choose the next batch workflow branch, then inspect batchWarnings, recommendedNextActions, errors, and output audit fields before reporting success.',
  },
  errorCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of per-font processing errors collected by the batch run.',
    agentAction: 'If nonzero, inspect errors[] and do not report full success.',
  },
  errors: {
    sourceTools: ['split_font_batch'],
    meaning: 'Collected per-font processing errors when batchErrorMode allows collection.',
    agentAction: 'Summarize failed inputs and consider rerunning with fail-after for stricter automation.',
  },
  maxFilesHit: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory', 'inspect_split_output'],
    meaning: 'True when a scan stopped at maxFiles before covering all files.',
    agentAction: 'Rerun with a higher maxFiles before trusting counts, plans, or audits.',
  },
  inputDirectoryDecision: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Compact first-pass route after input inspection: whether to rerun the scan, review invalid fonts, preview batch splitting directly, or run a non-destructive organization preview first.',
    agentAction: 'Use this as a no-write triage hint only. Inspect layout, recommendedBatchPreviewArgs, unsupported file summaries, and inspectionWarnings before splitting or organizing.',
  },
  'inputDirectoryDecision.directoryOrganizationSafety': {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Scan-local directory organization safety contract. It names organize_font_directory, gives no-write safePreviewArgs with the current inputDir and maxFiles, and states that reviewed organization is copy-only staging rather than final split output.',
    agentAction: 'Use this when input inspection has already run; copy safePreviewArgs for a no-write organization preview, then inspect the organizer response before any reviewed copy or split write.',
  },
  dryRun: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call only planned work instead of writing output.',
    agentAction: 'Confirm this explicitly because split_font_batch defaults to false while organize_font_directory defaults to true.',
  },
  planned: {
    sourceTools: ['split_font_batch'],
    meaning: 'Per-font dry-run plan entries for batch output paths and skip decisions.',
    agentAction: 'Review before rerunning a batch with dryRun:false.',
  },
  'planned[].wouldProcess': {
    sourceTools: ['split_font_batch'],
    meaning: 'Per-plan-entry flag showing whether that selected font would be processed on a reviewed write.',
    agentAction: 'When false, inspect planned[].skipReason and skipMode before deciding whether to rely on existing output or rerun with skipMode force.',
  },
  'planned[].skipReason': {
    sourceTools: ['split_font_batch'],
    meaning: 'Per-plan-entry reason from the batch skip check, such as manifest, missing-manifest, stale-manifest, or force.',
    agentAction: 'Use this to explain dry-run no-op entries and to decide whether existing output should be audited or force-reprocessed.',
  },
  plannedCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of planned batch entries returned for a dry-run.',
    agentAction: 'Use with planIncluded and batchWarnings to decide whether per-font planning was visible.',
  },
  wouldProcessCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of selected fonts that would be processed in a dry-run.',
    agentAction: 'Check before writing to avoid surprising no-op or oversized runs.',
  },
  skippedDuplicates: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Number of equivalent fonts skipped by the selected dedupe policy.',
    agentAction: 'Inspect dedupe mode and plans when representative choice matters.',
  },
  inspectionWarnings: {
    sourceTools: ['inspect_font_inputs', 'inspect_split_output'],
    meaning: 'Summary-level inspection notices with machine-readable codes.',
    agentAction: 'Inspect before trusting source or output audit results.',
  },
  inspectionWarningCount: {
    sourceTools: ['inspect_font_inputs', 'inspect_split_output'],
    meaning: 'Number of inspectionWarnings entries.',
    agentAction: 'Use as a compact signal that inspectionWarnings needs attention.',
  },
  organizationWarnings: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Summary-level organization notices with machine-readable codes.',
    agentAction: 'Review before using recommendedBatchPreviewArgs or running a real copy.',
  },
  organizationWarningCount: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Number of organizationWarnings entries.',
    agentAction: 'Use as a compact signal that organizationWarnings needs attention.',
  },
  recommendedNextActions: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Machine-readable follow-up checklist for batch and directory organization workflows. Each action includes inspectFields and successCriteria; actions with copyable args may also include suggestedArgs and, when those args mirror another response field, suggestedArgsField.',
    agentAction: 'Treat as guidance, inspect each action inspectFields, and satisfy successCriteria before proceeding or reporting completion. Prefer suggestedArgsField when present to cite the canonical args source; when suggestedArgs.maxFiles is present, preserve it unless intentionally changing the scan cap.',
  },
  'recommendedNextActions[].suggestedArgsField': {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Canonical response field that supplied a recommended next action suggestedArgs object, such as batchDecision.reviewedWriteArgs, batchDecision.auditArgs, recommendedBatchPreviewArgs, or sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs.',
    agentAction: 'Use this pointer before copying recommendedNextActions[].suggestedArgs so you know whether the action mirrors a reviewed-write route, an output audit route, direct original-input preview args, or organized staging safe-preview args.',
  },
  'recommendedNextActions[].suggestedArgs.maxFiles': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Current scan cap copied into organization follow-up actions that rescan source or staging directories. The explicit higher-cap rerun action may use a placeholder instead.',
    agentAction: 'Keep this value when copying suggestedArgs into the next inspect_font_inputs, organize_font_directory, or split_font_batch call so the follow-up covers the same bounded scan scope.',
  },
  operationMode: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Organization mode: plan-only for dry runs, copy-only for real organization runs.',
    agentAction: 'Use it to confirm the organizer did not split fonts and did not modify source files.',
  },
  copiedCount: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Number of font files copied into the organization output directory.',
    agentAction: 'Use with planActionSummary and organizationManifestPath to verify copy-only work.',
  },
  organizationManifestPath: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Path to the font-organization-manifest.json written by a non-dry-run organization call.',
    agentAction: 'Use this as evidence of the copied staging layout when dryRun is false.',
  },
  stagingDirectoryDecision: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Compact input-side decision for the organizer outputDir: whether it is only a planned staging directory, a ready source-like staging directory, existing targets needing review, or blocked by errors.',
    agentAction: 'Use this after organize_font_directory to distinguish organized source staging from split output. Inspect the staging with inspect_font_inputs, then run split_font_batch safe-preview before any split write; do not use inspect_split_output until split output has been generated.',
  },
  planActionSummary: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Compact counts of planned or executed organization actions.',
    agentAction: 'Use it when plan[] is omitted or too large, but do not treat it as a substitute for detailed review when copying.',
  },
  organizationDecision: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Compact machine-readable route recommendation after directory layout analysis, such as rerun with parsing, decide on invalid fonts, preview the original layout, or preview the organized staging output.',
    agentAction: 'Use this to choose the next workflow branch, then inspect recommendedNextActions, organizationWarnings, and planActionSummary before writing or reporting success.',
  },
  layoutDecision: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Top-level compact route summary for directory organization responses, including detected layout, preferred route, directoryHandling, source-safety signals, direct original-input preview readiness, and copy-only staging status.',
    agentAction: 'Use it as a first-pass routing index only; start with layoutDecision.directoryHandling, then inspect safetySummary, sourceLayoutMismatchSummary, organizationDecision, warnings, plan visibility, and output audits before writing or reporting success.',
  },
  'layoutDecision.directoryHandling': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Short answer for how to treat the current source directory: preview original input, review mixed layout, use an organized copy-only output, rerun organization, or stop because no copyable fonts were found.',
    agentAction: 'Use this as the first answer to "what should I do with this directory?", then verify the referenced suggestedArgs, sourceSafetyDecision, organizationWarnings, and plan fields.',
  },
  'layoutDecision.directoryHandling.recommendedMode': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Stable mode value inside layoutDecision.directoryHandling, such as preview-original-input, review-original-input-safe-preview, or preview-organized-output.',
    agentAction: 'Look up the value in get_agent_guidance.directoryHandlingModeCatalog, then inspect the catalog mustInspectFields before continuing.',
  },
  directoryHandlingModeCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable catalog for layoutDecision.directoryHandling.recommendedMode values, including meaning, whenSeen, next step, write behavior, source safety, required fields, and non-intuitive behavior.',
    agentAction: 'Use it to interpret directoryHandling.recommendedMode without guessing from strings; treat the catalog as guidance and still verify current tool response fields.',
  },
  directoryWorkflowSummary: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Response-local navigation summary for source-layout mismatch handling, safe staging, batch preview, reviewed write, and output audit.',
    agentAction: 'Use it to explain the current layout workflow in one pass, then verify the referenced safety, warning, plan, batch preview, and audit fields.',
  },
  'directoryWorkflowSummary.workflowSteps[].suggestedArgsField': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Canonical response field that supplied a workflow step suggestedArgs object, such as recommendedBatchPreviewArgs or sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs.',
    agentAction: 'Use this before copying workflowSteps[].suggestedArgs so you can cite the stable source field and avoid mixing policy fragments with runnable safe-preview calls.',
  },
  sourceLayoutMismatchSummary: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Compact response-local answer for whether the current source layout matches recommended batch grouping, whether direct original-input preview is safe, whether copy-only staging is optional or needed, and a decisionChecklist for agent routing.',
    agentAction: 'Use decisionChecklist first when choosing between direct split_font_batch preview, route-resolution reruns, and copy-only staging; still verify safetySummary, organizationWarnings, planActionSummary, and plan[] when available.',
  },
  'sourceLayoutMismatchSummary.decisionChecklist': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Machine-readable checklist inside sourceLayoutMismatchSummary for source safety, direct preview readiness, copy-only staging need, plan visibility, warnings, and required output audit.',
    agentAction: 'Inspect splitWriteReadiness, copyOnlyStagingReadiness, and items[] before writing; treat pass/ready signals as routing guidance, then satisfy the referenced evidence fields and successCriteria.',
  },
  'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Copyable split_font_batch safe-preview arguments for the organized staging directory after a copy-only organization write has already produced outputDir.',
    agentAction: 'When copyOnlyStaging.need is already-written-copy-only, copy these args to split_font_batch before any reviewed batch write; verify maxFiles, sourceSafetyDecision, batchWarnings, and planned output.',
  },
  'sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Checklist-item-local safe-preview arguments. The copy-only-staging item exposes these when the next safe step is previewing an already-written organized output directory.',
    agentAction: 'Prefer the item suggestedArgsField to locate the canonical args, then run the preview and satisfy the item evidenceFields and successCriteria before writing.',
  },
  planVisibility: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Explains whether the organizer response includes detailed plan[] entries or only compact summary fields.',
    agentAction: 'When planIncluded is false, use the listed summary fields for triage and rerun with includePlan:true before copying if exact per-file targets matter.',
  },
  plan: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Per-font copy or skip plan entries for directory organization.',
    agentAction: 'Review before running with dryRun:false, especially when overwriteExisting or duplicate skipping is involved.',
  },
  sourceDestructive: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether source files can be moved, deleted, or rewritten. Batch and organization calls should report false.',
    agentAction: 'Verify this remains false before calling a workflow source-safe.',
  },
  sourceFilesPreserved: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the source tree is preserved by the call. Batch and organization calls should report true.',
    agentAction: 'Use with sourceDestructive and writesSourceTree to verify source non-destructiveness.',
  },
  writesSourceTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the input directory tree is written by the call. This can be true when outputRoot/outputDir is inside inputDir, even though source font files are preserved.',
    agentAction: 'If true, explain that writes are limited to the nested output tree and verify sourceDestructive remains false.',
  },
  writesOutputTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call may write generated output, copies, or manifests into its output tree.',
    agentAction: 'Confirm this before telling the user a call was dry-run only.',
  },
  outputTreeInsideInputTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the configured output tree is inside or equal to the input directory tree.',
    agentAction: 'When true, future broad scans of the inputDir can reprocess generated or organized copies unless the output directory is excluded or used intentionally.',
  },
  mayOverwriteOutputTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call may replace existing files in its output tree.',
    agentAction: 'Warn or verify intent when true.',
  },
  parsedFontMetadata: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Whether the organizer parsed font metadata during planning.',
    agentAction: 'If false, do not rely on invalid-font counts, glyph counts, identity dedupe, or metadata family grouping.',
  },
  unparsedFontCount: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Number of supported-extension files intentionally not parsed because parseFonts was false.',
    agentAction: 'Rerun with parseFonts:true when metadata-sensitive decisions matter.',
  },
  effectiveBatchDedupeMode: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Actual dedupe mode used after accounting for parseFonts limitations.',
    agentAction: 'Check for same-path fallback when font-identity was requested but parsing was skipped.',
  },
  dedupeLimitedByParsing: {
    sourceTools: ['organize_font_directory'],
    meaning: 'True when identity dedupe could not run because font parsing was skipped.',
    agentAction: 'Rerun with parseFonts:true before trusting identity dedupe.',
  },
  recommendedBatchOptions: {
    sourceTools: ['organize_font_directory', 'get_agent_guidance'],
    meaning: 'Suggested split_font_batch option fragment from guidance or layout analysis. It is not a complete safe invocation by itself.',
    agentAction: 'Prefer recommendedBatchPreviewArgs for a copyable no-write preview call after organize_font_directory; use this field only as policy overrides after reviewing layout and warnings.',
  },
  batchPolicyGuide: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable customization guide for batchGroupBy, batchNamingMode, batchDedupeMode, and batchErrorMode choices.',
    agentAction: 'Use it when the user wants behavior different from safe defaults; pick the smallest explicit override, preview first, inspect listed fields, and satisfy successCriteria.',
  },
  batchCustomizationQuickReference: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Compact intent-to-override table for common batch customization requests, including preset-first preview/write args, minimal explicit overrides, inspect fields, and success criteria.',
    agentAction: 'Start here when the user asks to customize grouping, naming, dedupe, or error handling; copy the smallest explicit override into a safe-preview call, then inspect listed fields before reviewed-write.',
  },
  directoryOrganizationQuickAnswer: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Short answer for whether this package has a directory organization helper and whether that helper can modify source font files.',
    agentAction: 'Use this first when the user asks what to do with mismatched source directory layouts; start with its safe-preview args, then inspect source safety, layout, warnings, and plan evidence before any reviewed copy.',
  },
  'directoryOrganizationQuickAnswer.directoryOrganizationSafety': {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Guidance-level directory organization safety contract. It gives the same non-destructive helper summary as inputDirectoryDecision.directoryOrganizationSafety before a concrete input scan exists.',
    agentAction: 'Use this before inspect_font_inputs when the user asks whether a directory organizer exists or whether it can change source files; after input inspection, prefer inputDirectoryDecision.directoryOrganizationSafety for scan-local args.',
  },
  batchPolicySummary: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact echo of the batch-related policies selected for this call, linked to the relevant batchPolicyGuide success criteria.',
    agentAction: 'Use this first to explain the effective grouping, naming, dedupe, and error policy for the response; then inspect the listed fields and satisfy policySuccessCriteria.',
  },
  configurationTrace: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Machine-readable provenance for high-impact configuration values: raw tool default, workflowPreset default, or explicit argument.',
    agentAction: 'Inspect this when explaining why a preset behaved a certain way or whether an explicit option overrode the preset. Undefined explicit values are ignored and do not erase preset defaults.',
  },
  dedupeDecisionSummary: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact explanation of the dedupe pass: requested/effective mode, selected representative count, skipped duplicate count, identity-key gaps, path fallback, representative format priority, and capped identity evidence.',
    agentAction: 'Use this with skippedDuplicates and identityEvidenceSummary before claiming semantic dedupe worked; if pathFallbackUsed or dedupeLimitedByParsing is true, disclose the limitation or rerun with parsing enabled.',
  },
  fontIdentityBasisCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of identityBasis values emitted by inspect_font_inputs and dedupeDecisionSummary.identityEvidenceSummary, including OpenType name ID sources, confidence, and whether the basis proves semantic font identity.',
    agentAction: 'Use it before explaining why inputs were treated as duplicate fonts; disclose path-fallback, path-stem, missing, or low-confidence family-only bases when precision matters.',
  },
  identityBasis: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Machine-readable basis used to build a font identity key, such as typographic-family-subfamily, opentype-family-subfamily, full-name, postscript-name, family-only, or a fallback basis.',
    agentAction: 'Look up this value in fontIdentityBasisCatalog before claiming semantic equivalence or explaining dedupe results.',
  },
  'dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts': {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact count of identity basis values seen across selected and duplicate inputs during the dedupe pass.',
    agentAction: 'Use with fontIdentityBasisCatalog, pathFallbackUsed, and dedupeLimitedByParsing to decide how strongly identity dedupe can be described.',
  },
  configurationRecipes: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable mapping from common user intent to preset-first tool calls, explicit tradeoffs, inspectFields, and successCriteria.',
    agentAction: 'Use these recipes to choose workflowPreset and the smallest necessary overrides, then inspect the listed fields and satisfy successCriteria before treating the intent as complete.',
  },
  unsupportedFileCategoryCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable catalog explaining unsupportedFileSummary.byCategory categories, representative extensions, and handling behavior.',
    agentAction: 'Use it to interpret noisy real corpus summaries without assuming ignored archives, images, docs, or unsupported font-adjacent files are processed.',
  },
  recommendedBatchPreviewArgs: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Copyable no-write split_font_batch preview arguments for the detected layout. It includes inputDir, workflowPreset safe-preview, layout-specific overrides, and the current scan maxFiles as recommendedBatchPreviewArgs.maxFiles.',
    agentAction: 'Use this before writing batch output, then inspect safetySummary, batchWarnings, maxFilesHit, unsupportedFileDecision, unsupportedFileSummary, skippedDuplicates, and errors.',
  },
  layout: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Detected source directory shape and recommended batch grouping.',
    agentAction: 'Use it when the source directory may not match the desired family grouping.',
  },
  'layout.layoutKind': {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Detected source layout kind: empty, flat, nested, or mixed.',
    agentAction: 'Use flat or mixed as a signal to dry-run organization before direct batch splitting.',
  },
  directoryWorkflowDecisionMatrix: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable table mapping common directory scenarios to first tool, options, follow-up, safety flags, fields to inspect, and successCriteria.',
    agentAction: 'Use it to choose a safe workflow instead of guessing from path shape, then inspect mustInspectFields and satisfy successCriteria before advancing.',
  },
  directoryWorkflowExamples: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Concrete directory-shape examples, safe first calls, fields to inspect, and successCriteria.',
    agentAction: 'Match user-described layouts to examples, then verify mustInspectFields and successCriteria against actual tool responses.',
  },
  resultsIncluded: {
    sourceTools: ['split_font_batch'],
    meaning: 'Whether per-font batch results[] are included.',
    agentAction: 'If false, rely on summary counters or rerun with includeResults:true when per-font details are needed.',
  },
  planIncluded: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether per-item planned actions are included.',
    agentAction: 'If false, use summary fields or rerun with includeResults/includePlan true before detailed review.',
  },
  workflowPreset: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Named configuration preset applied before explicit arguments. Explicit tool arguments override preset values.',
    agentAction: 'Use this to explain why effective defaults such as dryRun, parseFonts, skip mode, or dedupe mode were selected.',
  },
  skipMode: {
    sourceTools: ['split_font_batch'],
    meaning: 'Resolved existing-output skip policy for batch runs: manifest accepts matching existing output, while force reprocesses selected fonts.',
    agentAction: 'Use manifest for incremental reruns; use force only when the user intentionally wants to rewrite existing output, then audit the output root.',
  },
  batchGroupBy: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Resolved first-level family/group directory policy: auto, source-dir, or font-family.',
    agentAction: 'Confirm the grouping mode matches the source layout and user intent before writing or copying output.',
  },
  batchNamingMode: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Resolved batch output naming policy: plain, numeric-suffix, or source-suffix.',
    agentAction: 'Confirm numeric suffixes only appear when the selected naming mode and real output-name conflicts require them.',
  },
  batchDedupeMode: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Resolved batch pre-processing dedupe policy: none, same-path, or font-identity.',
    agentAction: 'Confirm the mode matches user intent, especially when preserving every source font or deduping equivalent cross-format fonts matters.',
  },
  batchErrorMode: {
    sourceTools: ['split_font_batch'],
    meaning: 'Resolved per-font batch error handling mode: collect, fail-fast, or fail-after.',
    agentAction: 'Use collect only when the caller will inspect errors[] and errorCount; require errorCount zero before treating a batch as successful.',
  },
  skippedExisting: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of selected batch fonts skipped because existing output matched the selected skipMode.',
    agentAction: 'If nonzero, inspect skippedByManifest, batchDecision, batchWarnings, and audit existing output before reporting the batch as complete.',
  },
  skippedByManifest: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of selected batch fonts skipped specifically because a split-meta.json manifest matched the source file, effective config, tool version, and manifest version.',
    agentAction: 'Use this as evidence for manifest-based incremental reuse, then audit the output directory if relying on reused output.',
  },
  reprocessedBecauseSourceChanged: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of stale-manifest entries reprocessed because the source file no longer matched the existing manifest.',
    agentAction: 'Use this to explain why an incremental rerun wrote new output even when a manifest existed.',
  },
  reprocessedBecauseOptionsChanged: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of stale-manifest entries reprocessed because effective processing options changed while the source file still matched.',
    agentAction: 'Use this to explain option-driven reprocessing in incremental batch runs.',
  },
  workflowPresets: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of named workflow presets, their intended use, write behavior, and expanded batch/organization defaults.',
    agentAction: 'Prefer these presets for common workflows, then pass explicit overrides only for user-specific choices.',
  },
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
    agentAction: 'Check outputRoleDecision and outputStructureDecision.status first, then require structureSummary.conforms true before claiming the output directory is structurally valid; inspect issues[] and unexpectedFileExamples[] when false.',
  },
  outputStructureCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of inspect_split_output outputRoleDecision, audit statuses, structureSummary layout kinds, output modes, issue codes, pass criteria, and non-intuitive audit behavior.',
    agentAction: 'Use it before explaining outputRoleDecision, outputStructureDecision, or structureSummary issues; do not claim an output tree passed from ok:true alone.',
  },
  'structureSummary.layoutKind': {
    sourceTools: ['inspect_split_output'],
    meaning: 'Detected output layout kind, such as single-family, family-tree, mixed, empty, or unknown.',
    agentAction: 'Look up this value in outputStructureCatalog.layoutKinds before deciding whether the inspected outDir points at the correct output root.',
  },
  'structureSummary.issues[].code': {
    sourceTools: ['inspect_split_output'],
    meaning: 'Machine-readable output structure issue code, such as missing-manifests, unexpected-output-files, or web-output-missing.',
    agentAction: 'Look up each code in outputStructureCatalog.issueCodes, then inspect unexpectedFileExamples or entryIssueExamples for evidence.',
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
    agentAction: 'Require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, maxFilesHit false, and structureSummary.conforms true before reporting an output audit as complete.',
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


export const TOOL_OPTION_CATALOG = {
  summaryType: 'tool-option-catalog',
  purpose: 'Machine-readable guide to the tool input options that most often change behavior, safety, response size, or output structure.',
  useHow: [
    'Start with workflowPreset when available, then add only the smallest explicit override required by user intent.',
    'Treat defaults as tool-specific: organize_font_directory defaults to dryRun true, while split_font_batch defaults to dryRun false.',
    'After changing an option, inspect the listed response fields before claiming the option behaved as intended.',
  ],
  readOrder: ['split_font_batch', 'organize_font_directory', 'split_font', 'inspect_font_inputs', 'inspect_split_output'],
  split_font_batch: {
    tool: 'split_font_batch',
    sourceDestructive: false,
    writesFilesByDefault: true,
    preferredSafeStart: { workflowPreset: 'safe-preview' },
    preferredReviewedWrite: { workflowPreset: 'reviewed-write' },
    inspectAfterOverride: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'maxFilesHit', 'errorCount', 'errors'],
    options: {
      workflowPreset: {
        defaultValue: 'omitted-raw-tool-defaults',
        allowedValues: WORKFLOW_PRESET_NAMES,
        useWhen: 'Use preset-first configuration for common workflows before adding explicit overrides.',
        nonIntuitiveBehavior: 'Explicit options override preset values; safe-preview is no-write, while reviewed-write writes output.',
        inspectFields: ['workflowPreset', 'batchPolicySummary', 'sourceSafetyDecision', 'safetySummary'],
      },
      dryRun: {
        defaultValue: false,
        useWhen: 'Set true before unfamiliar batch writes to preview scan, dedupe, naming, and skip decisions.',
        nonIntuitiveBehavior: 'The raw split_font_batch default can write output; safe-preview sets dryRun true for agent-safe planning.',
        inspectFields: ['dryRun', 'sourceSafetyDecision', 'writesOutputTree', 'planned', 'batchDecision'],
      },
      includeResults: {
        defaultValue: true,
        useWhen: 'Keep true for small previews that need per-font result details.',
        nonIntuitiveBehavior: 'Set false for large reviewed writes or summary-only runs; then rely on counts, errors, and inspect_split_output.',
        inspectFields: ['resultsIncluded', 'processedFontCount', 'errorCount', 'errors'],
      },
      limit: {
        defaultValue: 20,
        useWhen: 'Cap how many deduped fonts are selected for processing.',
        nonIntuitiveBehavior: 'limit is applied after dedupe; maxFiles controls source scanning.',
        inspectFields: ['discoveredFontCount', 'deduplicatedCount', 'selectedFontCount', 'batchWarnings'],
      },
      maxFiles: {
        defaultValue: 5000,
        useWhen: 'Increase for large corpora before trusting counts or planned output.',
        nonIntuitiveBehavior: 'When maxFilesHit is true, counts and plans are incomplete until rerun with a higher maxFiles.',
        inspectFields: ['inputCountGuide', 'scannedFileCount', 'maxFilesHit', 'batchWarnings'],
      },
      skipMode: {
        defaultValue: 'manifest',
        allowedValues: SKIP_MODES,
        useWhen: 'Control incremental reruns against existing generated output.',
        nonIntuitiveBehavior: 'manifest compares source and effective options; force intentionally reprocesses even when output exists.',
        inspectFields: ['skipMode', 'skippedExisting', 'skippedByManifest', 'reprocessedBecauseSourceChanged', 'reprocessedBecauseOptionsChanged'],
      },
      batchGroupBy: {
        defaultValue: 'auto',
        allowedValues: BATCH_GROUP_BY_MODES,
        useWhen: 'Choose source folder grouping, metadata family grouping, or automatic layout-sensitive grouping.',
        nonIntuitiveBehavior: 'auto can choose different grouping for flat versus nested sources; preview planned paths before writing.',
        inspectFields: ['batchGroupBy', 'planned', 'batchWarnings', 'layoutDecision'],
      },
      batchNamingMode: {
        defaultValue: 'numeric-suffix',
        allowedValues: BATCH_NAMING_MODES,
        useWhen: 'Choose how same-group output name collisions are handled.',
        nonIntuitiveBehavior: 'numeric-suffix keeps the bare name until a real conflict exists; source-suffix is never implicit.',
        inspectFields: ['batchNamingMode', 'planned', 'batchWarnings'],
      },
      batchDedupeMode: {
        defaultValue: 'font-identity',
        allowedValues: BATCH_DEDUPE_MODES,
        useWhen: 'Choose whether equivalent source fonts are collapsed before splitting.',
        nonIntuitiveBehavior: 'font-identity is semantic when identity keys are available; same-path is only path/stem-level.',
        inspectFields: ['batchDedupeMode', 'dedupeDecisionSummary', 'skippedDuplicates'],
      },
      batchErrorMode: {
        defaultValue: 'fail-after',
        allowedValues: BATCH_ERROR_MODES,
        useWhen: 'Choose whether per-font failures stop immediately, are collected, or fail after processing selected fonts.',
        nonIntuitiveBehavior: 'collect can return ok:true with errors[]; require errorCount zero before reporting full success.',
        inspectFields: ['batchErrorMode', 'errorCount', 'errors', 'batchDecision'],
      },
      debugBatchDecisions: {
        defaultValue: false,
        useWhen: 'Turn on while diagnosing dedupe, naming, skip, or per-font error decisions.',
        nonIntuitiveBehavior: 'This emits structured logs for debugging; keep it off for normal large runs.',
        inspectFields: ['batchWarnings', 'dedupeDecisionSummary', 'planned', 'errors'],
      },
    },
  },
  organize_font_directory: {
    tool: 'organize_font_directory',
    sourceDestructive: false,
    writesFilesByDefault: false,
    writeBehavior: 'dryRun false copies selected fonts into outputDir only',
    preferredSafeStart: { workflowPreset: 'safe-preview' },
    preferredReviewedWrite: { workflowPreset: 'reviewed-write' },
    inspectAfterOverride: ['sourceSafetyDecision', 'safetySummary', 'layoutDecision', 'stagingDirectoryDecision', 'organizationDecision', 'directoryWorkflowSummary', 'sourceLayoutMismatchSummary', 'planActionSummary', 'organizationWarnings'],
    options: {
      workflowPreset: {
        defaultValue: 'omitted-raw-organization-defaults',
        allowedValues: WORKFLOW_PRESET_NAMES,
        useWhen: 'Use safe-preview for a parsed no-write plan, reviewed-write for a reviewed copy-only staging run, or structure-first for fast layout-only scans.',
        nonIntuitiveBehavior: 'Explicit options override preset values; reviewed-write copies to outputDir but still does not move, delete, or rewrite source files.',
        inspectFields: ['workflowPreset', 'batchPolicySummary', 'sourceSafetyDecision', 'safetySummary'],
      },
      dryRun: {
        defaultValue: true,
        useWhen: 'Leave true until the organization plan, warnings, and source safety fields have been reviewed.',
        nonIntuitiveBehavior: 'dryRun false is copy-only into outputDir; it never edits source files.',
        inspectFields: ['dryRun', 'operationMode', 'sourceSafetyDecision', 'planActionSummary'],
      },
      includePlan: {
        defaultValue: true,
        useWhen: 'Keep true when exact per-file copy/skip targets must be reviewed.',
        nonIntuitiveBehavior: 'includePlan false omits plan[] but keeps planActionSummary and planVisibility rerun guidance.',
        inspectFields: ['planIncluded', 'directoryWorkflowSummary.planVisibility', 'planActionSummary', 'plan'],
      },
      parseFonts: {
        defaultValue: true,
        useWhen: 'Keep true for identity dedupe, metadata family grouping, glyph counts, and invalid-font detection.',
        nonIntuitiveBehavior: 'parseFonts false makes identity dedupe and metadata-family grouping provisional; validFontCount and invalidFontCount are null, not zero.',
        inspectFields: ['parsedFontMetadata', 'unparsedFontCount', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing', 'dedupeDecisionSummary'],
      },
      batchGroupBy: {
        defaultValue: 'auto',
        allowedValues: BATCH_GROUP_BY_MODES,
        useWhen: 'Choose how organized copy folders are grouped.',
        nonIntuitiveBehavior: 'font-family grouping depends on parseFonts true; source-dir grouping can preserve archive-per-family layouts.',
        inspectFields: ['batchGroupBy', 'layout', 'recommendedBatchPreviewArgs', 'planActionSummary'],
      },
      batchNamingMode: {
        defaultValue: 'numeric-suffix',
        allowedValues: BATCH_NAMING_MODES,
        useWhen: 'Choose how copied filenames avoid same-group collisions.',
        nonIntuitiveBehavior: 'numeric-suffix only appends suffixes for real conflicts; plain requires manual collision review.',
        inspectFields: ['batchNamingMode', 'plan', 'planActionSummary', 'organizationWarnings'],
      },
      batchDedupeMode: {
        defaultValue: 'font-identity',
        allowedValues: BATCH_DEDUPE_MODES,
        useWhen: 'Choose whether equivalent fonts are copied once or preserved individually.',
        nonIntuitiveBehavior: 'When parseFonts is false, requested font-identity effectively falls back to path/stem-level dedupe.',
        inspectFields: ['requestedBatchDedupeMode', 'effectiveBatchDedupeMode', 'dedupeDecisionSummary', 'skippedDuplicates'],
      },
      copyInvalidFonts: {
        defaultValue: false,
        useWhen: 'Set true only when supported-extension files that failed parsing must still be copied to staging.',
        nonIntuitiveBehavior: 'Invalid copied files may still fail later during splitting; disclose this before treating staging as ready.',
        inspectFields: ['invalidFontCount', 'organizationWarnings', 'planActionSummary', 'errors'],
      },
      overwriteExisting: {
        defaultValue: false,
        useWhen: 'Set true only when replacing files already present in outputDir is intentional.',
        nonIntuitiveBehavior: 'overwriteExisting affects outputDir only; source files remain untouched.',
        inspectFields: ['overwriteExisting', 'mayOverwriteOutputTree', 'skippedTargetExists', 'organizationWarnings'],
      },
    },
  },
  split_font: {
    tool: 'split_font',
    sourceDestructive: false,
    writesFilesByDefault: true,
    inspectAfterOverride: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'manifestPath'],
    options: {
      outDir: {
        defaultValue: 'split-output/<font-family>',
        useWhen: 'Set when the output location should be stable or shared with a later inspect_split_output audit.',
        nonIntuitiveBehavior: 'outDir is an output tree; source font files are not modified.',
        inspectFields: ['manifestPath', 'resultType', 'outputMode'],
      },
      smallGlyphAction: {
        defaultValue: 'subset',
        allowedValues: SMALL_GLYPH_ACTIONS,
        useWhen: 'Choose how very small fonts should be handled.',
        nonIntuitiveBehavior: 'single-woff2 and copy-original are fallbacks; copy-original does not generate normal WOFF2/CSS subset output.',
        inspectFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings'],
      },
      splitFailureAction: {
        defaultValue: 'error',
        allowedValues: SPLIT_FAILURE_ACTIONS,
        useWhen: 'Choose whether split failures can fall back to one WOFF2 file.',
        nonIntuitiveBehavior: 'single-woff2 fallback is not a normal multi-subset split and must be disclosed.',
        inspectFields: ['resultType', 'outputMode', 'usedFallback', 'warnings', 'errors'],
      },
      oversizedKernAction: {
        defaultValue: 'preserve',
        allowedValues: OVERSIZED_KERN_ACTIONS,
        useWhen: 'Choose whether an oversized kern table may be stripped before splitting.',
        nonIntuitiveBehavior: 'strip is a destructive transform on the generated processing buffer, not on the source file; it may affect kerning.',
        inspectFields: ['warnings', 'processingSummary'],
      },
      fontFamily: {
        defaultValue: 'derived-from-source-or-cn-font-split',
        useWhen: 'Override CSS font-family when the generated CSS should use a specific family name.',
        nonIntuitiveBehavior: 'This controls CSS metadata, not source grouping for batch runs.',
        inspectFields: ['manifestPath', 'warnings'],
      },
    },
  },
  inspect_font_inputs: {
    tool: 'inspect_font_inputs',
    sourceDestructive: false,
    writesFilesByDefault: false,
    inspectAfterOverride: ['inputCountGuide', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary', 'validFontCount', 'invalidFontCount', 'missingIdentityCount'],
    options: {
      maxFiles: {
        defaultValue: 50000,
        useWhen: 'Raise for larger root scans before trusting corpus counts.',
        nonIntuitiveBehavior: 'maxFilesHit true means counts are truncated and should not be reported as complete.',
        inspectFields: ['inputCountGuide', 'maxFilesHit', 'inspectionWarnings'],
      },
      includeFiles: {
        defaultValue: true,
        useWhen: 'Set false for compact scans over large or noisy source trees.',
        nonIntuitiveBehavior: 'includeFiles false hides per-font files[] details but keeps aggregate counts and unsupported-file summaries.',
        inspectFields: ['filesIncluded', 'inputCountGuide', 'unsupportedFileSummary'],
      },
    },
  },
  inspect_split_output: {
    tool: 'inspect_split_output',
    sourceDestructive: false,
    writesFilesByDefault: false,
    inspectAfterOverride: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'structureSummary', 'maxFilesHit'],
    options: {
      maxFiles: {
        defaultValue: 200000,
        useWhen: 'Raise when auditing very large output trees.',
        nonIntuitiveBehavior: 'maxFilesHit true makes the audit incomplete even when ok is true.',
        inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'maxFilesHit', 'inspectionWarnings'],
      },
      includeFiles: {
        defaultValue: true,
        useWhen: 'Set false for compact output audits where only structure and counts are needed.',
        nonIntuitiveBehavior: 'compact audits can omit files[] while still returning outputRoleDecision, outputStructureDecision, and structureSummary.',
        inspectFields: ['filesIncluded', 'outputRoleDecision', 'outputStructureDecision', 'structureSummary'],
      },
      includeFamilies: {
        defaultValue: true,
        useWhen: 'Set false for compact output audits over large family trees.',
        nonIntuitiveBehavior: 'includeFamilies false hides families[] inventory but does not skip structureSummary checks.',
        inspectFields: ['familiesIncluded', 'outputRoleDecision', 'outputStructureDecision', 'structureSummary'],
      },
    },
  },
};


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
