export const OUTPUT_AUDIT_PASS_CRITERIA_LIST = Object.freeze([
  'outputRoleDecision.auditAppliesToThisDirectory is not false',
  'outputStructureDecision.status is pass',
  'auditStatus is pass',
  'auditPassed is true',
  'structureSummary.conforms is true',
  'maxFilesHit is false',
  'inspectionWarnings contains no action-required output structure or truncation warnings',
]);

export const OUTPUT_AUDIT_PASS_CONDITIONS = Object.freeze([
  'outputRoleDecision.auditAppliesToThisDirectory not false',
  'outputStructureDecision.status pass',
  'auditStatus pass',
  'auditPassed true',
  'structureSummary.conforms true',
  'maxFilesHit false',
  'no action-required inspectionWarnings',
]);

function joinWithFinalAnd(values) {
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

export const OUTPUT_AUDIT_PASS_CONDITIONS_TEXT = joinWithFinalAnd(OUTPUT_AUDIT_PASS_CONDITIONS);

export const OUTPUT_AUDIT_PASS_CRITERIA =
  `Require ${OUTPUT_AUDIT_PASS_CONDITIONS_TEXT} before treating output as structurally valid.`;

export const OUTPUT_AUDIT_VALID_OUTPUT_CRITERIA =
  `Require ${OUTPUT_AUDIT_PASS_CONDITIONS_TEXT} before treating output as valid.`;

export const OUTPUT_AUDIT_COMPLETION_CRITERIA =
  `Require ${OUTPUT_AUDIT_PASS_CONDITIONS_TEXT} before reporting completion.`;

export const OUTPUT_AUDIT_REPORT_PASS_ACTION =
  'You may report the output structure audit as passed only when outputRoleDecision, outputStructureDecision.status, auditStatus, auditPassed, structureSummary.conforms, and maxFilesHit all satisfy the pass criteria.';

export const OUTPUT_AUDIT_MINIMUM_PASS_TEXT =
  'outputRoleDecision.auditAppliesToThisDirectory not false plus outputStructureDecision.status pass';
