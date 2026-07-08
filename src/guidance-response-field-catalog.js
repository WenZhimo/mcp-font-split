export const GUIDANCE_HEADER_FIELD_CATALOG = {
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
  interfaceContract: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable MCP response contract index, including stability tiers and stable output fields by tool.',
    agentAction: 'Use stableOutputFieldsByTool with live outputSchema before relying on response fields in automation; treat diagnostic and experimental fields as less stable.',
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
};

export const GUIDANCE_WARNING_FIELD_CATALOG = {
  warningCodeCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of machine-readable warning codes emitted by batch, inspection, and organization tools.',
    agentAction: 'Use it to interpret warning severity and choose follow-up actions.',
  },
};

export const GUIDANCE_REFERENCE_FIELD_CATALOG = {
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
};

export const GUIDANCE_SAFE_WORKFLOW_FIELD_CATALOG = {
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
};

export const GUIDANCE_BATCH_RECOMMENDATION_FIELD_CATALOG = {
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
};

export const GUIDANCE_DIRECTORY_HANDLING_FIELD_CATALOG = {
  directoryHandlingModeCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable catalog for layoutDecision.directoryHandling.recommendedMode values, including meaning, whenSeen, next step, write behavior, source safety, required fields, and non-intuitive behavior.',
    agentAction: 'Use it to interpret directoryHandling.recommendedMode without guessing from strings; treat the catalog as guidance and still verify current tool response fields.',
  },
};

export const GUIDANCE_IDENTITY_FIELD_CATALOG = {
  fontIdentityBasisCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of identityBasis values emitted by inspect_font_inputs and dedupeDecisionSummary.identityEvidenceSummary, including OpenType name ID sources, confidence, and whether the basis proves semantic font identity.',
    agentAction: 'Use it before explaining why inputs were treated as duplicate fonts; disclose path-fallback, path-stem, missing, or low-confidence family-only bases when precision matters.',
  },
};

export const GUIDANCE_CONFIGURATION_FIELD_CATALOG = {
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
};

export const GUIDANCE_DIRECTORY_WORKFLOW_FIELD_CATALOG = {
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
};

export const GUIDANCE_WORKFLOW_PRESET_FIELD_CATALOG = {
  workflowPresets: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of named workflow presets, their intended use, write behavior, and expanded batch/organization defaults.',
    agentAction: 'Prefer these presets for common workflows, then pass explicit overrides only for user-specific choices.',
  },
};

export const GUIDANCE_OUTPUT_STRUCTURE_FIELD_CATALOG = {
  outputStructureCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of inspect_split_output outputRoleDecision, audit statuses, structureSummary layout kinds, output modes, issue codes, pass criteria, and non-intuitive audit behavior.',
    agentAction: 'Use it before explaining outputRoleDecision, outputStructureDecision, or structureSummary issues; do not claim an output tree passed from ok:true alone.',
  },
};
