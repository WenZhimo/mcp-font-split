export const SOURCE_LAYOUT_MISMATCH_FIELD = 'sourceLayoutMismatchSummary';
export const SOURCE_LAYOUT_DECISION_CHECKLIST_FIELD = 'sourceLayoutMismatchSummary.decisionChecklist';
export const SOURCE_LAYOUT_FIELD_LIST_KEYS = new Set(['inspectFields', 'mustInspectFields', 'responseFields']);
export const INPUT_DIRECTORY_DECISION_FIELD = 'inputDirectoryDecision';
export const INPUT_DIRECTORY_ORGANIZATION_SAFETY_FIELD = 'inputDirectoryDecision.directoryOrganizationSafety';

export const DIRECTORY_ROUTE_REQUIRED_INSPECT_FIELDS = [
  'inputCountGuide',
  'layoutDecision',
  'layoutDecision.directoryHandling',
  'stagingDirectoryDecision',
  'organizationDecision',
  'directoryWorkflowSummary',
  SOURCE_LAYOUT_MISMATCH_FIELD,
  SOURCE_LAYOUT_DECISION_CHECKLIST_FIELD,
  'recommendedBatchPreviewArgs',
  'unsupportedFileDecision',
  'unsupportedFileSummary',
  'organizationWarnings',
  'planActionSummary',
];

export const SOURCE_PREFLIGHT_CORE_INSPECT_FIELDS = [
  'inputCountGuide',
  INPUT_DIRECTORY_DECISION_FIELD,
  INPUT_DIRECTORY_ORGANIZATION_SAFETY_FIELD,
  'layout',
  'recommendedBatchPreviewArgs',
  'maxFilesHit',
  'inspectionWarnings',
  'supportedFontCount',
  'unsupportedFileDecision',
  'unsupportedFileSummary',
];

export const SOURCE_PREFLIGHT_METADATA_INSPECT_FIELDS = [
  ...SOURCE_PREFLIGHT_CORE_INSPECT_FIELDS,
  'validFontCount',
  'invalidFontCount',
  'missingIdentityCount',
];

export function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function sourcePreflightInspectFields(additionalFields = []) {
  return uniqueStrings([
    ...SOURCE_PREFLIGHT_CORE_INSPECT_FIELDS,
    ...(Array.isArray(additionalFields) ? additionalFields : []),
  ]);
}

export function withDirectoryRouteInspectFields(fields) {
  return uniqueStrings([
    ...(Array.isArray(fields) ? fields : []),
    ...DIRECTORY_ROUTE_REQUIRED_INSPECT_FIELDS,
  ]);
}

function withSourceLayoutDecisionChecklistField(fields) {
  if (!Array.isArray(fields)) return fields;
  const sourceLayoutIndex = fields.indexOf(SOURCE_LAYOUT_MISMATCH_FIELD);
  if (sourceLayoutIndex === -1 || fields.includes(SOURCE_LAYOUT_DECISION_CHECKLIST_FIELD)) return fields;
  return [
    ...fields.slice(0, sourceLayoutIndex + 1),
    SOURCE_LAYOUT_DECISION_CHECKLIST_FIELD,
    ...fields.slice(sourceLayoutIndex + 1),
  ];
}

export function attachSourceLayoutDecisionChecklistFields(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      attachSourceLayoutDecisionChecklistFields(item, seen);
    }
    return value;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SOURCE_LAYOUT_FIELD_LIST_KEYS.has(key)) {
      value[key] = withSourceLayoutDecisionChecklistField(child);
    } else {
      attachSourceLayoutDecisionChecklistFields(child, seen);
    }
  }
  return value;
}
