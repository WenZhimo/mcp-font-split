import path from 'node:path';

function assertInspectFieldsExist(action, responsesByTool, context) {
  if (!action) {
    throw new Error(`${context}: expected action for inspectFields check.`);
  }
  assertSourceLayoutDecisionChecklistCompanionFields(action, `${context}: action ${action.id}`);
  if (typeof action.successCriteria !== 'string' || action.successCriteria.trim() === '') {
    throw new Error(`${context}: action ${action.id} (${action.tool}) is missing successCriteria.`);
  }
  if (!Array.isArray(action.inspectFields)) return;
  const response = responsesByTool[action.tool];
  if (!response) return;
  const missing = action.inspectFields.filter((field) => {
    const topLevelField = field.split('.')[0];
    return !Object.hasOwn(response, topLevelField);
  });
  if (missing.length > 0) {
    throw new Error(`${context}: action ${action.id} (${action.tool}) references missing inspectFields: ${missing.join(', ')}`);
  }
}

function assertRecommendedNextActionInspectFields(actions, responsesByTool, context) {
  for (const action of actions || []) {
    assertInspectFieldsExist(action, responsesByTool, context);
  }
}

function assertSourceLayoutDecisionChecklistCompanionFields(value, context, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSourceLayoutDecisionChecklistCompanionFields(item, context, seen);
    }
    return;
  }
  for (const fieldListName of ['inspectFields', 'mustInspectFields', 'responseFields']) {
    const fields = value[fieldListName];
    if (
      Array.isArray(fields)
      && fields.includes('sourceLayoutMismatchSummary')
      && !fields.includes('sourceLayoutMismatchSummary.decisionChecklist')
    ) {
      throw new Error(`${context}: ${fieldListName} must include sourceLayoutMismatchSummary.decisionChecklist whenever it includes sourceLayoutMismatchSummary.`);
    }
  }
  for (const child of Object.values(value)) {
    assertSourceLayoutDecisionChecklistCompanionFields(child, context, seen);
  }
}

function assertNonEmptyString(value, context, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context}: expected non-empty ${fieldName}.`);
  }
}

function assertNonEmptyStringArray(value, context, fieldName) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${context}: expected non-empty string array ${fieldName}.`);
  }
}

function assertNonEmptyArray(value, context, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context}: expected non-empty array ${fieldName}.`);
  }
}

function assertGuidanceItemsHaveCompletionProof(items, { collectionName, inspectFieldName = 'inspectFields' }) {
  if (!Array.isArray(items)) {
    throw new Error(`Expected ${collectionName} to be an array.`);
  }
  for (const item of items) {
    const id = item?.id || item?.templateId;
    assertNonEmptyString(id, collectionName, 'id');
    assertNonEmptyStringArray(item?.[inspectFieldName], `${collectionName}.${id}`, inspectFieldName);
    assertNonEmptyString(item?.successCriteria, `${collectionName}.${id}`, 'successCriteria');
  }
}

const DIRECTORY_ROUTE_REQUIRED_INSPECT_FIELDS = [
  'inputCountGuide',
  'layoutDecision',
  'layoutDecision.directoryHandling',
  'stagingDirectoryDecision',
  'organizationDecision',
  'directoryWorkflowSummary',
  'sourceLayoutMismatchSummary',
  'sourceLayoutMismatchSummary.decisionChecklist',
  'recommendedBatchPreviewArgs',
  'unsupportedFileDecision',
  'unsupportedFileSummary',
  'organizationWarnings',
  'planActionSummary',
];

function assertDirectoryRouteInspectFields(fields, context, fieldListName = 'inspectFields') {
  assertNonEmptyStringArray(fields, context, fieldListName);
  for (const fieldName of DIRECTORY_ROUTE_REQUIRED_INSPECT_FIELDS) {
    if (!fields.includes(fieldName)) {
      throw new Error(`${context}: expected directory route ${fieldListName} to include ${fieldName}.`);
    }
  }
}

function assertNextToolDecisionSummary(summary, { context, workflow, primaryRouteId }) {
  if (
    !summary
    || summary.summaryType !== 'next-tool-decision-summary'
    || summary.workflow !== workflow
    || summary.primaryRouteId !== primaryRouteId
    || summary.safetyDefaults?.organizationWritesAreCopyOnly !== true
    || summary.safetyDefaults?.sourceDestructive !== false
    || summary.safetyDefaults?.outputAuditRequiredAfterWrite !== true
  ) {
    throw new Error(`${context}: expected nextToolDecisionSummary for ${workflow}.`);
  }
  assertNonEmptyStringArray(summary.routeOrder, context, 'routeOrder');
  assertNonEmptyArray(summary.routes, context, 'routes');
  const routesById = new Map(summary.routes.map((route) => [route.id, route]));
  const quickExamplesById = new Map((summary.quickStartCallExamples || []).map((example) => [example.id, example]));
  if (
    summary.workflowQuickStart?.summaryType !== 'workflow-quick-start'
    || summary.workflowQuickStart?.workflow !== workflow
    || !summary.workflowQuickStart?.generatedFromQuickStartCallExamples
    || !quickExamplesById.has(summary.workflowQuickStart?.recommendedExampleId)
    || summary.workflowQuickStart?.recommendedCallExample?.id !== summary.workflowQuickStart?.recommendedExampleId
    || summary.workflowQuickStart?.recommendedCallExample?.sourceDestructive !== false
    || !summary.workflowQuickStart?.recommendedCallExample?.generatedFromTemplate
    || !Array.isArray(summary.workflowQuickStart?.alternateExampleIds)
    || !Array.isArray(summary.workflowQuickStart?.alternateCallExamples)
    || typeof summary.workflowQuickStart?.decisionHint !== 'string'
  ) {
    throw new Error(`${context}: expected workflowQuickStart to point at a template-derived recommended quick call.`);
  }
  const expectedWorkflowQuickStartByWorkflow = {
    overview: 'inspect-unfamiliar-source',
    single: 'process-single-font',
    batch: 'inspect-unfamiliar-source',
    inspect: 'inspect-unfamiliar-source',
    organize: 'plan-source-layout',
  };
  if (summary.workflowQuickStart.recommendedExampleId !== expectedWorkflowQuickStartByWorkflow[workflow]) {
    throw new Error(`${context}: expected workflowQuickStart recommendation for ${workflow}.`);
  }
  for (const requiredRoute of ['setup-uncertain', 'unfamiliar-directory', 'layout-uncertain-or-staging-wanted', 'batch-safe-preview', 'batch-reviewed-write', 'output-audit']) {
    if (!routesById.has(requiredRoute)) {
      throw new Error(`${context}: expected route ${requiredRoute}.`);
    }
  }
  for (const route of summary.routes) {
    assertNonEmptyString(route.id, `${context}.routes`, 'id');
    assertNonEmptyString(route.useWhen, `${context}.${route.id}`, 'useWhen');
    assertNonEmptyString(route.firstTool, `${context}.${route.id}`, 'firstTool');
    assertNonEmptyStringArray(route.inspectFields, `${context}.${route.id}`, 'inspectFields');
    assertNonEmptyString(route.continueWhen, `${context}.${route.id}`, 'continueWhen');
    if (typeof route.writesFiles !== 'boolean' || route.sourceDestructive !== false) {
      throw new Error(`${context}.${route.id}: expected explicit write and source-safety flags.`);
    }
  }
  const layoutRoute = routesById.get('layout-uncertain-or-staging-wanted');
  const stagingRoute = routesById.get('copy-only-staging');
  const structureRoute = routesById.get('large-noisy-structure-first');
  const batchPreviewRoute = routesById.get('batch-safe-preview');
  const batchWriteRoute = routesById.get('batch-reviewed-write');
  const auditRoute = routesById.get('output-audit');
  assertDirectoryRouteInspectFields(layoutRoute?.inspectFields, `${context}.routes.layout-uncertain-or-staging-wanted`);
  assertDirectoryRouteInspectFields(structureRoute?.inspectFields, `${context}.routes.large-noisy-structure-first`);
  assertDirectoryRouteInspectFields(stagingRoute?.inspectFields, `${context}.routes.copy-only-staging`);
  if (
    layoutRoute?.firstTool !== 'organize_font_directory'
    || layoutRoute?.firstArgsHint?.workflowPreset !== 'safe-preview'
    || !layoutRoute.inspectFields?.includes('sourceLayoutMismatchSummary.decisionChecklist')
    || stagingRoute?.writeBehavior !== 'copy-only-outputDir'
    || stagingRoute?.sourceDestructive !== false
    || batchPreviewRoute?.writesFiles !== false
    || batchPreviewRoute?.firstArgsHint?.workflowPreset !== 'safe-preview'
    || batchWriteRoute?.writesFiles !== true
    || batchWriteRoute?.firstArgsHint?.workflowPreset !== 'reviewed-write'
    || batchWriteRoute?.nextRouteAfterSuccess !== 'output-audit'
    || !batchWriteRoute.inspectFields?.includes('dedupeDecisionSummary')
    || auditRoute?.firstTool !== 'inspect_split_output'
    || !auditRoute.inspectFields?.includes('outputRoleDecision')
    || !auditRoute.inspectFields?.includes('outputStructureDecision')
    || !auditRoute.continueWhen?.includes('outputRoleDecision.auditAppliesToThisDirectory')
  ) {
    throw new Error(`${context}: expected nextToolDecisionSummary to route layout, preview, reviewed write, and audit safely.`);
  }
  for (const requiredExample of ['process-single-font', 'inspect-unfamiliar-source', 'plan-source-layout', 'quick-structure-first-plan', 'copy-reviewed-staging', 'preview-batch-output', 'write-reviewed-batch-output', 'audit-split-output']) {
    if (!quickExamplesById.has(requiredExample)) {
      throw new Error(`${context}: expected quickStartCallExamples to include ${requiredExample}.`);
    }
  }
  for (const example of summary.quickStartCallExamples || []) {
    assertNonEmptyString(example.templateId, `${context}.quickStartCallExamples.${example.id}`, 'templateId');
    assertNonEmptyString(example.tool, `${context}.quickStartCallExamples.${example.id}`, 'tool');
    assertNonEmptyString(example.useWhen, `${context}.quickStartCallExamples.${example.id}`, 'useWhen');
    assertNonEmptyStringArray(example.inspectFields, `${context}.quickStartCallExamples.${example.id}`, 'inspectFields');
    assertNonEmptyStringArray(example.customize, `${context}.quickStartCallExamples.${example.id}`, 'customize');
    assertNonEmptyString(example.successCriteria, `${context}.quickStartCallExamples.${example.id}`, 'successCriteria');
    if (!example.generatedFromTemplate || typeof example.writesFiles !== 'boolean' || example.sourceDestructive !== false) {
      throw new Error(`${context}.quickStartCallExamples.${example.id}: expected template-derived explicit safety flags.`);
    }
  }
  const stagingExample = quickExamplesById.get('copy-reviewed-staging');
  const layoutExample = quickExamplesById.get('plan-source-layout');
  const structureExample = quickExamplesById.get('quick-structure-first-plan');
  const singleExample = quickExamplesById.get('process-single-font');
  const previewExample = quickExamplesById.get('preview-batch-output');
  const writeExample = quickExamplesById.get('write-reviewed-batch-output');
  const auditExample = quickExamplesById.get('audit-split-output');
  assertDirectoryRouteInspectFields(layoutExample?.inspectFields, `${context}.quickStartCallExamples.plan-source-layout`);
  assertDirectoryRouteInspectFields(structureExample?.inspectFields, `${context}.quickStartCallExamples.quick-structure-first-plan`);
  assertDirectoryRouteInspectFields(stagingExample?.inspectFields, `${context}.quickStartCallExamples.copy-reviewed-staging`);
  if (
    singleExample?.tool !== 'split_font'
    || singleExample?.args?.fontPath !== '<font-file>'
    || singleExample?.nextRouteAfterSuccess !== 'output-audit'
    || stagingExample?.args?.workflowPreset !== 'reviewed-write'
    || stagingExample?.args?.outputDir !== '<organized-output-dir>'
    || stagingExample?.writesFiles !== true
    || previewExample?.args?.workflowPreset !== 'safe-preview'
    || previewExample?.writesFiles !== false
    || writeExample?.args?.workflowPreset !== 'reviewed-write'
    || writeExample?.nextRouteAfterSuccess !== 'output-audit'
    || !writeExample.inspectFields?.includes('dedupeDecisionSummary')
    || auditExample?.tool !== 'inspect_split_output'
    || auditExample?.args?.outDir !== '<split-output-root>'
  ) {
    throw new Error(`${context}: expected quickStartCallExamples to preserve safe template args and write/audit routing.`);
  }
  assertSourceLayoutDecisionChecklistCompanionFields(summary, `${context}: nextToolDecisionSummary`);
}

function assertRecommendedWorkflowPlanHasCompletionProof(plan, templateIds, context) {
  if (!plan || typeof plan !== 'object') {
    throw new Error(`${context}: expected recommendedWorkflowPlan object.`);
  }
  assertNonEmptyString(plan.id, context, 'id');
  assertNonEmptyArray(plan.orderedSteps, context, 'orderedSteps');
  assertGuidanceItemsHaveCompletionProof(plan.orderedSteps, {
    collectionName: `${context}.orderedSteps`,
  });
  for (const step of plan.orderedSteps || []) {
    if (Object.hasOwn(step, 'completeWhen')) {
      throw new Error(`${context}.orderedSteps.${step.id}: completeWhen is obsolete; use successCriteria.`);
    }
    if (step.templateId && !templateIds.has(step.templateId)) {
      throw new Error(`${context}.orderedSteps.${step.id}: references missing safe template ${step.templateId}.`);
    }
    if (
      ['directory-mismatch-plan', 'structure-first-large-directory', 'copy-organized-staging'].includes(step.templateId)
      || (step.inspectFields?.includes('directoryWorkflowSummary') && step.inspectFields?.includes('recommendedBatchPreviewArgs'))
    ) {
      assertDirectoryRouteInspectFields(step.inspectFields, `${context}.orderedSteps.${step.id}`);
    }
  }
  if (Array.isArray(plan.decisionPoints)) {
    assertGuidanceItemsHaveCompletionProof(plan.decisionPoints, {
      collectionName: `${context}.decisionPoints`,
    });
    for (const decision of plan.decisionPoints || []) {
      if (Object.hasOwn(decision, 'completeWhen')) {
        throw new Error(`${context}.decisionPoints.${decision.id}: completeWhen is obsolete; use successCriteria.`);
      }
      if (decision.useTemplateId && !templateIds.has(decision.useTemplateId)) {
        throw new Error(`${context}.decisionPoints.${decision.id}: references missing safe template ${decision.useTemplateId}.`);
      }
      if (
        ['directory-mismatch-plan', 'structure-first-large-directory', 'copy-organized-staging'].includes(decision.useTemplateId)
        || (decision.inspectFields?.includes('directoryWorkflowSummary') && decision.inspectFields?.includes('recommendedBatchPreviewArgs'))
      ) {
        assertDirectoryRouteInspectFields(decision.inspectFields, `${context}.decisionPoints.${decision.id}`);
      }
    }
  }
}

function assertBatchPolicyGuide(policyGuide) {
  assertNonEmptyArray(policyGuide, 'batchPolicyGuide', 'batchPolicyGuide');
  const expectedPolicies = {
    batchGroupBy: ['auto', 'source-dir', 'font-family'],
    batchNamingMode: ['numeric-suffix', 'plain', 'source-suffix'],
    batchDedupeMode: ['font-identity', 'same-path', 'none'],
    batchErrorMode: ['fail-after', 'fail-fast', 'collect'],
  };
  const byOptionName = new Map((policyGuide || []).map((policy) => [policy.optionName, policy]));
  for (const [optionName, values] of Object.entries(expectedPolicies)) {
    const policy = byOptionName.get(optionName);
    if (!policy) {
      throw new Error(`Expected batchPolicyGuide to include ${optionName}.`);
    }
    assertNonEmptyString(policy.id, `batchPolicyGuide.${optionName}`, 'id');
    assertNonEmptyString(policy.defaultValue, `batchPolicyGuide.${optionName}`, 'defaultValue');
    assertNonEmptyString(policy.purpose, `batchPolicyGuide.${optionName}`, 'purpose');
    assertNonEmptyStringArray(policy.appliesTo, `batchPolicyGuide.${optionName}`, 'appliesTo');
    assertNonEmptyArray(policy.values, `batchPolicyGuide.${optionName}`, 'values');
    const actualValues = new Set(policy.values.map((item) => item.value));
    for (const value of values) {
      if (!actualValues.has(value)) {
        throw new Error(`Expected batchPolicyGuide.${optionName} to include value ${value}.`);
      }
    }
    for (const value of policy.values) {
      assertNonEmptyString(value.value, `batchPolicyGuide.${optionName}`, 'value');
      assertNonEmptyString(value.useWhen, `batchPolicyGuide.${optionName}.${value.value}`, 'useWhen');
      assertNonEmptyString(value.avoidWhen, `batchPolicyGuide.${optionName}.${value.value}`, 'avoidWhen');
      assertNonEmptyStringArray(value.inspectFields, `batchPolicyGuide.${optionName}.${value.value}`, 'inspectFields');
      assertNonEmptyString(value.successCriteria, `batchPolicyGuide.${optionName}.${value.value}`, 'successCriteria');
    }
  }
  const dedupeNone = byOptionName.get('batchDedupeMode')?.values?.find((item) => item.value === 'none');
  if (!dedupeNone?.successCriteria?.includes('skippedDuplicates is zero')) {
    throw new Error('Expected batchPolicyGuide batchDedupeMode none to preserve every selected supported font.');
  }
  const namingNumeric = byOptionName.get('batchNamingMode')?.values?.find((item) => item.value === 'numeric-suffix');
  if (!namingNumeric?.successCriteria?.includes('only where collisions require them')) {
    throw new Error('Expected batchPolicyGuide numeric-suffix to explain suffixes only on real conflicts.');
  }
  const collect = byOptionName.get('batchErrorMode')?.values?.find((item) => item.value === 'collect');
  if (!collect?.successCriteria?.includes('Every errors[] entry is inspected')) {
    throw new Error('Expected batchPolicyGuide collect to require errors[] inspection.');
  }
}

function assertBatchPolicySummary(summary, { context, appliesToTool, expectedValues, expectedEffectiveValues = {} }) {
  if (!summary || summary.policySource !== 'get_agent_guidance.batchPolicyGuide' || summary.appliesToTool !== appliesToTool) {
    throw new Error(`${context}: expected batchPolicySummary to point at batchPolicyGuide for ${appliesToTool}.`);
  }
  if (!Array.isArray(summary.selectedPolicies) || summary.selectedPolicies.length === 0) {
    throw new Error(`${context}: expected batchPolicySummary.selectedPolicies.`);
  }
  if (!Array.isArray(summary.policySuccessCriteria) || summary.policySuccessCriteria.length !== summary.selectedPolicies.length) {
    throw new Error(`${context}: expected batchPolicySummary.policySuccessCriteria for every selected policy.`);
  }
  if (!Array.isArray(summary.inspectFields) || summary.inspectFields.length === 0) {
    throw new Error(`${context}: expected batchPolicySummary.inspectFields.`);
  }
  if (!Array.isArray(summary.policyGuideInspectFields) || summary.policyGuideInspectFields.length < summary.inspectFields.length) {
    throw new Error(`${context}: expected batchPolicySummary.policyGuideInspectFields to retain the source policy fields.`);
  }
  for (const [optionName, value] of Object.entries(expectedValues)) {
    const selected = summary.selectedPolicies.find((policy) => policy.optionName === optionName);
    const success = summary.policySuccessCriteria.find((policy) => policy.optionName === optionName);
    if (summary.values?.[optionName] !== value || selected?.value !== value || success?.value !== value) {
      throw new Error(`${context}: expected batchPolicySummary ${optionName} to be ${value}.`);
    }
    if (!selected.inspectFields?.length || !selected.successCriteria || !success.successCriteria) {
      throw new Error(`${context}: expected batchPolicySummary ${optionName} to include inspectFields and successCriteria.`);
    }
  }
  for (const [optionName, value] of Object.entries(expectedEffectiveValues)) {
    const selected = summary.selectedPolicies.find((policy) => policy.optionName === optionName);
    const success = summary.policySuccessCriteria.find((policy) => policy.optionName === optionName);
    if (summary.effectiveValues?.[optionName] !== value || selected?.effectiveValue !== value || success?.effectiveValue !== value) {
      throw new Error(`${context}: expected batchPolicySummary effective ${optionName} to be ${value}.`);
    }
  }
}

function assertConfigurationTrace(trace, {
  context,
  appliesToTool,
  workflowPreset,
  expectedSources = {},
  expectedEffectiveValues = {},
  expectedExplicitOverrideFields = [],
}) {
  if (
    !trace
    || trace.summaryType !== 'configuration-trace'
    || trace.appliesToTool !== appliesToTool
    || trace.workflowPreset !== workflowPreset
    || !Array.isArray(trace.fields)
    || !Array.isArray(trace.explicitOverrideFields)
  ) {
    throw new Error(`${context}: expected configurationTrace to summarize configuration source for ${appliesToTool}.`);
  }
  const fieldsByName = Object.fromEntries(trace.fields.map((field) => [field.optionName, field]));
  for (const [optionName, source] of Object.entries(expectedSources)) {
    if (fieldsByName[optionName]?.source !== source) {
      throw new Error(`${context}: expected configurationTrace ${optionName} source to be ${source}.`);
    }
  }
  for (const [optionName, value] of Object.entries(expectedEffectiveValues)) {
    if (!Object.is(fieldsByName[optionName]?.effectiveValue, value)) {
      throw new Error(`${context}: expected configurationTrace ${optionName} effectiveValue to be ${value}.`);
    }
  }
  for (const optionName of expectedExplicitOverrideFields) {
    if (!trace.explicitOverrideFields.includes(optionName)) {
      throw new Error(`${context}: expected configurationTrace explicitOverrideFields to include ${optionName}.`);
    }
  }
}

function assertSourceSafetyDecision(decision, {
  context,
  appliesToTool,
  expectedStatus,
  expectedWritesFiles,
  expectedWritesSourceTree,
  expectedOutputTreeInsideInputTree,
  expectedOutputPathRole,
  expectedRequiresOutputAudit,
}) {
  if (
    !decision
    || decision.summaryType !== 'source-safety-decision'
    || decision.appliesToTool !== appliesToTool
    || decision.status !== expectedStatus
    || decision.sourceDestructive !== false
    || decision.sourceFilesPreserved !== true
    || decision.sourceFilesMovedDeletedOrRewritten !== false
    || decision.sourceBackupRequired !== false
    || decision.writesFiles !== expectedWritesFiles
    || decision.writesOutputTree !== expectedWritesFiles
    || decision.writesSourceTree !== expectedWritesSourceTree
    || decision.outputTreeInsideInputTree !== expectedOutputTreeInsideInputTree
    || decision.outputPathRole !== expectedOutputPathRole
    || decision.requiresOutputAudit !== expectedRequiresOutputAudit
    || typeof decision.shortAnswer !== 'string'
    || decision.shortAnswer.trim() === ''
  ) {
    throw new Error(`${context}: expected sourceSafetyDecision to summarize source preservation and write scope.`);
  }
  for (const fieldName of [
    'sourceSafetyDecision',
    'safetySummary',
    'sourceDestructive',
    'sourceFilesPreserved',
    'writesSourceTree',
    'writesOutputTree',
    'outputTreeInsideInputTree',
    'mayOverwriteOutputTree',
  ]) {
    if (!decision.mustInspectFields?.includes(fieldName)) {
      throw new Error(`${context}: expected sourceSafetyDecision.mustInspectFields to include ${fieldName}.`);
    }
  }
  if (!Array.isArray(decision.nonIntuitiveBehavior) || decision.nonIntuitiveBehavior.length === 0) {
    throw new Error(`${context}: expected sourceSafetyDecision to include nonIntuitiveBehavior notes.`);
  }
}

function assertDirectoryWorkflowSummary(summary, {
  context,
  expectedLayoutKind,
  expectedRoute,
  expectedCurrentStep,
  expectedReviewReason = null,
  expectedStepIds = [],
}) {
  if (
    !summary
    || summary.summaryType !== 'directory-layout-workflow'
    || summary.appliesToTool !== 'organize_font_directory'
    || summary.currentStep !== expectedCurrentStep
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary for organize_font_directory ${expectedCurrentStep}.`);
  }
  assertSourceLayoutDecisionChecklistCompanionFields(summary, `${context}: directoryWorkflowSummary`);
  if (
    summary.sourceLayout?.layoutKind !== expectedLayoutKind
    || summary.route?.route !== expectedRoute
    || summary.currentCallSafety?.sourceDestructive !== false
    || summary.currentCallSafety?.sourceFilesPreserved !== true
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary layout, route, and source safety.`);
  }
  if (!summary.policySnapshot?.batchGroupBy || !summary.policySnapshot?.effectiveBatchDedupeMode) {
    throw new Error(`${context}: expected directoryWorkflowSummary.policySnapshot.`);
  }
  const sourceLayoutMismatchSummary = summary.sourceLayoutMismatchSummary;
  if (
    !sourceLayoutMismatchSummary
    || sourceLayoutMismatchSummary.summaryType !== 'source-layout-mismatch'
    || sourceLayoutMismatchSummary.appliesToTool !== 'organize_font_directory'
    || sourceLayoutMismatchSummary.currentLayoutKind !== expectedLayoutKind
    || sourceLayoutMismatchSummary.copyOnlyStaging?.sourceDestructive !== false
    || sourceLayoutMismatchSummary.copyOnlyStaging?.sourceFilesPreserved !== true
    || sourceLayoutMismatchSummary.copyOnlyStaging?.sourceFilesMovedDeletedOrRewritten !== false
    || sourceLayoutMismatchSummary.directOriginalInput?.previewRequiredBeforeWrite !== true
    || !Array.isArray(sourceLayoutMismatchSummary.successCriteria)
    || !sourceLayoutMismatchSummary.nonIntuitiveBehavior?.some((item) => item.includes('never source-destructive'))
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary.sourceLayoutMismatchSummary to explain layout match, direct preview, copy-only staging, and source safety.`);
  }
  const decisionChecklist = sourceLayoutMismatchSummary.decisionChecklist;
  const decisionChecklistItemIds = new Set((decisionChecklist?.items || []).map((item) => item.id));
  const sourceSafetyDecision = (decisionChecklist?.items || []).find((item) => item.id === 'source-safety-preserved');
  const directPreviewDecision = (decisionChecklist?.items || []).find((item) => item.id === 'direct-original-input-preview');
  if (
    decisionChecklist?.summaryType !== 'source-layout-decision-checklist'
    || decisionChecklist.primaryRoute !== expectedRoute
    || !decisionChecklist.splitWriteReadiness
    || !decisionChecklist.copyOnlyStagingReadiness
    || sourceSafetyDecision?.status !== 'pass'
    || sourceSafetyDecision?.requiredBeforeWrite !== true
    || !directPreviewDecision?.evidenceFields?.includes('recommendedBatchPreviewArgs')
  ) {
    throw new Error(`${context}: expected sourceLayoutMismatchSummary.decisionChecklist to expose route, write readiness, source safety, and direct preview guidance.`);
  }
  if (
    !['preview-organized-output', 'rerun-with-font-parsing', 'decide-on-invalid-fonts', 'no-copyable-fonts'].includes(expectedRoute)
    && directPreviewDecision?.nextTool !== 'split_font_batch'
  ) {
    throw new Error(`${context}: expected sourceLayoutMismatchSummary.decisionChecklist to point direct preview routes at split_font_batch.`);
  }
  for (const expectedDecisionId of ['source-safety-preserved', 'direct-original-input-preview', 'copy-only-staging', 'plan-detail-before-copy', 'warnings-reviewed', 'post-write-output-audit']) {
    if (!decisionChecklistItemIds.has(expectedDecisionId)) {
      throw new Error(`${context}: expected sourceLayoutMismatchSummary.decisionChecklist item ${expectedDecisionId}.`);
    }
  }
  if (expectedRoute === 'review-mixed-layout' && sourceLayoutMismatchSummary.mismatchDetected !== true) {
    throw new Error(`${context}: expected mixed layout summary to mark a layout mismatch.`);
  }
  if (expectedRoute === 'preview-organized-output' && sourceLayoutMismatchSummary.directOriginalInput?.status !== 'use-organized-output') {
    throw new Error(`${context}: expected copied organization summary to point at the organized output.`);
  }
  if (
    typeof summary.planVisibility?.planIncluded !== 'boolean'
    || !Array.isArray(summary.planVisibility?.detailsOmitted)
    || !summary.planVisibility?.availableSummaryFields?.includes('planActionSummary')
    || !summary.planVisibility?.availableSummaryFields?.includes('sourceLayoutMismatchSummary')
    || !summary.planVisibility?.successCriteria
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary.planVisibility to describe compact plan visibility.`);
  }
  if (!summary.directBatchPreviewArgs?.workflowPreset || summary.directBatchPreviewArgs.workflowPreset !== 'safe-preview') {
    throw new Error(`${context}: expected directoryWorkflowSummary.directBatchPreviewArgs to be a safe-preview call.`);
  }
  if (!Array.isArray(summary.workflowSteps) || summary.workflowSteps.length < 3) {
    throw new Error(`${context}: expected directoryWorkflowSummary.workflowSteps.`);
  }
  const stepIds = new Set(summary.workflowSteps.map((step) => step.id));
  for (const expectedStepId of ['review-source-layout', 'reviewed-batch-write', 'audit-split-output', ...expectedStepIds]) {
    if (!stepIds.has(expectedStepId)) {
      throw new Error(`${context}: expected directoryWorkflowSummary.workflowSteps to include ${expectedStepId}.`);
    }
  }
  const reviewStep = summary.workflowSteps.find((step) => step.id === 'review-source-layout');
  for (const expectedField of [
    'inputCountGuide',
    'layoutDecision',
    'layoutDecision.directoryHandling',
    'stagingDirectoryDecision',
    'directoryWorkflowSummary',
    'sourceLayoutMismatchSummary.decisionChecklist',
    'recommendedBatchPreviewArgs',
  ]) {
    if (!reviewStep?.inspectFields?.includes(expectedField)) {
      throw new Error(`${context}: expected review-source-layout step to require ${expectedField}.`);
    }
  }
  for (const step of summary.workflowSteps) {
    if (!step.tool || typeof step.writesFiles !== 'boolean' || step.sourceDestructive !== false || !step.successCriteria) {
      throw new Error(`${context}: expected directoryWorkflowSummary step ${step.id} to include tool, writesFiles, sourceDestructive, and successCriteria.`);
    }
    if (step.tool === 'split_font_batch' && step.writesFiles === false && step.suggestedArgs && !step.suggestedArgsField) {
      throw new Error(`${context}: expected no-write split_font_batch step ${step.id} to expose suggestedArgsField.`);
    }
  }
  if (expectedReviewReason && !(summary.sourceLayout?.reviewReasons || []).includes(expectedReviewReason)) {
    throw new Error(`${context}: expected directoryWorkflowSummary review reason ${expectedReviewReason}.`);
  }
  if (
    !Array.isArray(summary.successCriteria)
    || summary.successCriteria.length < 3
    || !Array.isArray(summary.nonIntuitiveBehavior)
    || !summary.nonIntuitiveBehavior.some((item) => item.includes('never moves, deletes, or rewrites source font files'))
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary success criteria and non-intuitive behavior notes.`);
  }
}

function assertLayoutDecision(decision, {
  context,
  expectedLayoutKind,
  expectedRoute,
  expectedOperationMode,
  expectedDirectStatus = null,
  expectedStagingNeed = null,
  expectedRecommendedMode = null,
}) {
  if (
    !decision
    || decision.summaryType !== 'layout-decision'
    || decision.appliesToTool !== 'organize_font_directory'
    || decision.layoutKind !== expectedLayoutKind
    || decision.route !== expectedRoute
    || decision.operationMode !== expectedOperationMode
    || typeof decision.shortAnswer !== 'string'
    || decision.shortAnswer.trim() === ''
    || decision.directoryHandling?.summaryType !== 'directory-handling-decision'
    || typeof decision.directoryHandling?.recommendedMode !== 'string'
    || typeof decision.directoryHandling?.shortAnswer !== 'string'
    || decision.directoryHandling.shortAnswer.trim() === ''
    || decision.directoryHandling?.helperTool !== 'organize_font_directory'
    || decision.directoryHandling?.helperToolDefaultMode !== 'dry-run-plan-only'
    || decision.directoryHandling?.helperToolWriteMode !== 'copy-only-outputDir'
    || decision.directoryHandling?.sourceDestructive !== false
    || decision.directoryHandling?.sourceFilesPreserved !== true
    || decision.directoryHandling?.copyOnlyStagingIsDestructive !== false
    || !decision.directoryHandling?.mustInspectFields?.includes('layoutDecision')
    || !decision.directoryHandling?.mustInspectFields?.includes('sourceSafetyDecision')
    || decision.sourceDestructive !== false
    || decision.sourceFilesPreserved !== true
    || !decision.recommendedNextActionId
    || !Array.isArray(decision.mustInspectFields)
    || !decision.mustInspectFields.includes('safetySummary')
    || !decision.mustInspectFields.includes('organizationDecision')
    || !decision.mustInspectFields.includes('sourceLayoutMismatchSummary')
    || !decision.mustInspectFields.includes('sourceLayoutMismatchSummary.decisionChecklist')
    || !Array.isArray(decision.nonIntuitiveBehavior)
    || !decision.nonIntuitiveBehavior.some((item) => item.includes('never moves, deletes, or rewrites source font files'))
  ) {
    throw new Error(`${context}: expected top-level layoutDecision to summarize route, safety, and required inspection fields.`);
  }
  if (expectedDirectStatus && decision.directOriginalInput?.status !== expectedDirectStatus) {
    throw new Error(`${context}: expected layoutDecision directOriginalInput status ${expectedDirectStatus}.`);
  }
  if (expectedStagingNeed && decision.copyOnlyStaging?.need !== expectedStagingNeed) {
    throw new Error(`${context}: expected layoutDecision copyOnlyStaging need ${expectedStagingNeed}.`);
  }
  if (expectedRecommendedMode && decision.directoryHandling.recommendedMode !== expectedRecommendedMode) {
    throw new Error(`${context}: expected layoutDecision.directoryHandling recommendedMode ${expectedRecommendedMode}.`);
  }
  if (expectedDirectStatus && decision.directoryHandling.originalInputPreviewStatus !== expectedDirectStatus) {
    throw new Error(`${context}: expected layoutDecision.directoryHandling original input preview status ${expectedDirectStatus}.`);
  }
  if (expectedStagingNeed && decision.directoryHandling.copyOnlyStagingNeed !== expectedStagingNeed) {
    throw new Error(`${context}: expected layoutDecision.directoryHandling copy-only staging need ${expectedStagingNeed}.`);
  }
  if (
    decision.copyOnlyStaging?.sourceDestructive !== false
    || decision.copyOnlyStaging?.sourceFilesPreserved !== true
    || decision.copyOnlyStaging?.sourceFilesMovedDeletedOrRewritten !== false
  ) {
    throw new Error(`${context}: expected layoutDecision copyOnlyStaging to be source-safe.`);
  }
}

function assertStagingDirectoryDecision(decision, {
  context,
  expectedStatus,
  expectedOutputDir,
  expectedCopiedCount,
}) {
  if (
    !decision
    || decision.summaryType !== 'staging-directory-decision'
    || decision.appliesToTool !== 'organize_font_directory'
    || decision.status !== expectedStatus
    || decision.outputDir !== expectedOutputDir
    || decision.outputDirRole !== 'organized-font-source-staging'
    || decision.isSplitOutput !== false
    || decision.sourceDestructive !== false
    || decision.sourceFilesPreserved !== true
    || decision.copiedCount !== expectedCopiedCount
    || decision.inspectTool !== 'inspect_font_inputs'
    || decision.previewTool !== 'split_font_batch'
    || decision.auditToolAfterSplitWrite !== 'inspect_split_output'
    || decision.safePreviewArgs?.inputDir !== expectedOutputDir
    || decision.safePreviewArgs?.workflowPreset !== 'safe-preview'
    || !decision.mustInspectFields?.includes('inputCountGuide')
    || !decision.mustInspectFields?.includes('organizationManifestPath')
    || !decision.successCriteria?.some((item) => item.includes('inspect_font_inputs'))
    || !decision.nonIntuitiveBehavior?.some((item) => item.includes('not split output'))
  ) {
    throw new Error(`${context}: expected stagingDirectoryDecision to distinguish organized source staging from split output.`);
  }
}

function assertTemplateOmitsArgs(template, omittedArgs, context) {
  const leaked = omittedArgs.filter((key) => Object.hasOwn(template?.args || {}, key));
  if (leaked.length > 0) {
    throw new Error(`${context}: expected template args to omit preset-provided defaults: ${leaked.join(', ')}`);
  }
}

function assertObjectOmitsKeys(object, omittedKeys, context) {
  const leaked = omittedKeys.filter((key) => Object.hasOwn(object || {}, key));
  if (leaked.length > 0) {
    throw new Error(`${context}: expected object to omit preset-provided defaults: ${leaked.join(', ')}`);
  }
}

function assertOutputAuditStatus(result, expected, context) {
  if (
    result.auditStatus !== expected.auditStatus
    || result.auditPassed !== expected.auditPassed
    || !Array.isArray(result.auditBlockingReasons)
    || result.outputStructureDecision?.summaryType !== 'output-structure-decision'
    || result.outputStructureDecision?.status !== expected.auditStatus
    || result.outputStructureDecision?.auditPassed !== expected.auditPassed
    || result.outputStructureDecision?.maxFilesHit !== result.maxFilesHit
    || result.outputStructureDecision?.structureConforms !== (result.structureSummary?.conforms === true)
  ) {
    throw new Error(`${context}: expected compact output structure decision ${expected.auditStatus}.`);
  }
  if (expected.reasonCode) {
    const reason = result.auditBlockingReasons.find((item) => item.code === expected.reasonCode);
    if (!reason) {
      throw new Error(`${context}: expected auditBlockingReasons to include ${expected.reasonCode}.`);
    }
    const expectedRecommendedAction = expected.reasonCode === 'output-scan-truncated'
      ? 'rerun-inspect-split-output-with-higher-maxFiles'
      : 'inspect-structureSummary-issues';
    if (
      result.outputStructureDecision.reviewRecommended !== true
      || result.outputStructureDecision.recommendedAction !== expectedRecommendedAction
    ) {
      throw new Error(`${context}: expected outputStructureDecision to recommend ${expectedRecommendedAction}.`);
    }
    if (!result.outputStructureDecision.blockingReasonCodes?.includes(expected.reasonCode)) {
      throw new Error(`${context}: expected outputStructureDecision to include blocking reason ${expected.reasonCode}.`);
    }
    if (expected.issueCode && !(reason.issueCodes || []).includes(expected.issueCode)) {
      throw new Error(`${context}: expected ${expected.reasonCode} to reference issue code ${expected.issueCode}.`);
    }
    if (expected.issueCode && !result.outputStructureDecision.issueCodes?.includes(expected.issueCode)) {
      throw new Error(`${context}: expected outputStructureDecision to include issue code ${expected.issueCode}.`);
    }
  } else if (result.auditBlockingReasons.length !== 0) {
    throw new Error(`${context}: expected no auditBlockingReasons for passing audit.`);
  } else if (
    result.outputStructureDecision.reviewRecommended !== false
    || result.outputStructureDecision.recommendedAction !== 'continue'
  ) {
    throw new Error(`${context}: expected passing outputStructureDecision to continue without review.`);
  }
}

function assertActionSuggestedArgsOmit(action, omittedKeys, context) {
  assertObjectOmitsKeys(action?.suggestedArgs, omittedKeys, context);
}

function isInsidePath(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSafeRecommendedBatchPreviewArgs(previewArgs, expected, context) {
  if (
    previewArgs?.inputDir !== expected.inputDir
    || previewArgs?.workflowPreset !== 'safe-preview'
    || (expected.batchGroupBy !== undefined && previewArgs?.batchGroupBy !== expected.batchGroupBy)
    || (expected.maxFiles !== undefined && previewArgs?.maxFiles !== expected.maxFiles)
  ) {
    throw new Error(`${context}: expected recommendedBatchPreviewArgs to be a copyable safe-preview batch call for the detected layout.`);
  }
  assertObjectOmitsKeys(previewArgs, [
    'dryRun',
    'includeResults',
    'skipMode',
    'batchNamingMode',
    'batchDedupeMode',
    'batchErrorMode',
    'splitFailureAction',
  ], `${context} recommendedBatchPreviewArgs`);
}

function assertSuggestedArgsPreserveMaxFiles(action, expectedMaxFiles, context) {
  if (!action?.suggestedArgs || action.suggestedArgs.maxFiles !== expectedMaxFiles) {
    throw new Error(`${context}: expected suggestedArgs.maxFiles to preserve the current scan cap ${expectedMaxFiles}.`);
  }
}


export {
  assertInspectFieldsExist,
  assertRecommendedNextActionInspectFields,
  assertSourceLayoutDecisionChecklistCompanionFields,
  assertNonEmptyString,
  assertNonEmptyStringArray,
  assertNonEmptyArray,
  assertGuidanceItemsHaveCompletionProof,
  assertDirectoryRouteInspectFields,
  assertNextToolDecisionSummary,
  assertRecommendedWorkflowPlanHasCompletionProof,
  assertBatchPolicyGuide,
  assertBatchPolicySummary,
  assertConfigurationTrace,
  assertSourceSafetyDecision,
  assertDirectoryWorkflowSummary,
  assertLayoutDecision,
  assertStagingDirectoryDecision,
  assertTemplateOmitsArgs,
  assertObjectOmitsKeys,
  assertOutputAuditStatus,
  assertActionSuggestedArgsOmit,
  isInsidePath,
  assertSafeRecommendedBatchPreviewArgs,
  assertSuggestedArgsPreserveMaxFiles,
};
