import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getAgentGuidance } from '../font-split.js';

const PUBLIC_DOC_FILES = [
  'README.md',
  'README.en.md',
  'API.md',
  'API.zh-CN.md',
  'BEHAVIOR.zh-CN.md',
];

const MOJIBAKE_MARKERS = [
  '鍙傝',
  '榛樿',
  '鐩',
  '銆',
  '乣',
];

async function assertPublicDocsReadableAndLinked() {
  const markdownLinkPattern = /!?\[[^\]]+\]\(([^)]+)\)/g;

  for (const fileName of PUBLIC_DOC_FILES) {
    const content = await fs.readFile(fileName, 'utf8');
    const marker = MOJIBAKE_MARKERS.find((item) => content.includes(item));
    if (marker) {
      throw new Error(`${fileName} contains likely mojibake marker: ${marker}`);
    }

    for (const match of content.matchAll(markdownLinkPattern)) {
      let target = match[1].trim();
      if (!target || /^(https?:|mailto:)/i.test(target) || target.startsWith('#')) continue;
      if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
      const [targetPath] = target.split('#');
      if (!targetPath) continue;
      const resolved = path.resolve(path.dirname(fileName), decodeURIComponent(targetPath));
      try {
        await fs.access(resolved);
      } catch {
        throw new Error(`${fileName} has a broken local Markdown link: ${target}`);
      }
    }
  }
}

export async function runApiDocsSmoke() {
  await assertPublicDocsReadableAndLinked();

  const apiDocs = {
    'API.md': await fs.readFile('API.md', 'utf8'),
    'API.zh-CN.md': await fs.readFile('API.zh-CN.md', 'utf8'),
  };
  const assertDocsContainAny = (label, tokens) => {
    for (const [fileName, content] of Object.entries(apiDocs)) {
      if (!tokens.some((token) => content.includes(token))) {
        throw new Error(`${fileName} is missing documented ${label}: ${tokens.join(' or ')}`);
      }
    }
  };
  const assertDocsContain = (label, token) => assertDocsContainAny(label, [token]);

  const client = new Client({ name: 'api-docs-smoke', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['src/server.js'],
    cwd: process.cwd(),
  });
  await client.connect(transport);
  try {
    const result = await client.listTools();
    const guidance = getAgentGuidance({ workflow: 'batch', detailLevel: 'full' });
    for (const tool of result.tools) {
      assertDocsContain(`${tool.name} heading`, `## \`${tool.name}\``);
      for (const propertyName of Object.keys(tool.inputSchema?.properties || {})) {
        assertDocsContain(`${tool.name}.${propertyName}`, `\`${propertyName}\``);
      }
    }

    for (const sectionName of guidance.guidanceView?.availableSections || []) {
      assertDocsContain(`get_agent_guidance section ${sectionName}`, `\`${sectionName}\``);
    }
    for (const preset of guidance.workflowPresets || []) {
      assertDocsContain(`workflowPreset ${preset.id}`, `\`${preset.id}\``);
    }
    for (const fieldName of [
      'guidanceView',
      'projectStatusNotice',
      'toolSafetyQuickReference',
      'recommendedWorkflowPlan',
      'nextToolDecisionSummary',
      'workflowQuickStart',
      'quickStartCallExamples[]',
      'configurationRecipes',
      'batchCustomizationQuickReference',
      'directoryOrganizationQuickAnswer',
      'batchPolicyGuide',
      'batchPolicySummary',
      'configurationTrace',
      'dedupeDecisionSummary',
      'identityEvidenceSummary',
      'fontIdentityBasisCatalog',
      'identityBasis',
      'dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts',
      'outputStructureCatalog',
      'layoutDecision',
      'layoutDecision.directoryHandling',
      'stagingDirectoryDecision',
      'directoryWorkflowSummary',
      'directoryWorkflowSummary.workflowSteps[].suggestedArgsField',
      'sourceLayoutMismatchSummary',
      'sourceLayoutMismatchSummary.decisionChecklist',
      'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs',
      'sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs',
      'planVisibility',
      'directoryWorkflowSummary.planVisibility',
      'unsupportedFileCategoryCatalog',
      'directoryWorkflowDecisionMatrix',
      'safeInvocationTemplates',
      'localVerificationOutputGuide',
      'errorResponseCatalog',
      'warningCodeCatalog',
      'toolResponseFieldCatalog',
      'toolOptionCatalog',
      'workflowPresets',
      'recommendedBatchPreviewArgs',
      'recommendedBatchPreviewArgs.maxFiles',
      'recommendedNextActions',
      'recommendedNextActions[].suggestedArgsField',
      'recommendedNextActions[].suggestedArgs.maxFiles',
      'successCriteria',
      'sourceSafetyDecision',
      'safetySummary',
      'inputCountGuide',
      'inputDirectoryDecision',
      'inputDirectoryDecision.directoryOrganizationSafety',
      'directoryOrganizationQuickAnswer.directoryOrganizationSafety',
      'batchGroupBy',
      'batchNamingMode',
      'batchDedupeMode',
      'batchErrorMode',
      'batchDecision',
      'organizationDecision',
      'sourceDestructive',
      'writesSourceTree',
      'writesOutputTree',
      'outputTreeInsideInputTree',
      'mayOverwriteOutputTree',
      'outputRoleDecision',
      'outputStructureDecision',
      'auditStatus',
      'auditPassed',
      'auditBlockingReasons',
      'structureSummary',
      'structureSummary.layoutKind',
      'structureSummary.issues[].code',
      'missingManifestCount',
      'maxFilesHit',
      'unsupportedFileDecision',
      'unsupportedFileSummary',
      'unsupportedFileSummary.total',
      'unsupportedFileSummary.byExtension',
      'unsupportedFileSummary.byCategory',
      'unsupportedFileSummary.categoryDetails',
      'unsupportedFileSummary.handlingSummary',
      'unsupportedFileSummary.examples',
      'coverageSummary.unsupportedFileCategoryCoverage',
      'coverageSummary.toolCoverageSummary',
      'coverageSummary.outputStructureAuditSummary',
      'reliabilityGateDecision',
      'corpusCountGuide',
      'completionReportGuide',
      'runSummaries',
      'omittedDetailFields',
      'debugBatchDecisions',
      'humanSummary',
    ]) {
      assertDocsContainAny(`important field ${fieldName}`, [`\`${fieldName}\``, `\`${fieldName}[]\``]);
    }
    assertDocsContain('compact check checklist id', '`local-compact-check-passed`');
    assertDocsContain('compact check command', '`npm run check:compact`');
    assertDocsContain('compact check result', '`compact-check-result`');
    assertDocsContain('real corpus suite checklist id', '`local-real-corpus-suite-passed`');
    assertDocsContain('local verification output guide', '`localVerificationOutputGuide`');
    assertDocsContain('local verification completion report guide', '`completionReportGuide`');
    assertDocsContain('local verification forbidden claims', '`forbiddenClaims`');
    assertDocsContain('local verification concise report template', '`conciseReportTemplate`');
    assertDocsContain('tool safety quick reference', '`toolSafetyQuickReference`');
    assertDocsContain('tool safety moved/deleted/rewrite field', '`sourceFilesMovedDeletedOrRewritten`');
    assertDocsContain('tool safety default write field', '`defaultWritesFiles`');
    assertDocsContain('first input preflight example', '`first-input-preflight-example`');
    assertDocsContain('first input preflight inspect tool', '"tool": "inspect_font_inputs"');
    assertDocsContain('first input preflight compact files flag', '"includeFiles": false');
    assertDocsContain('first input preflight directory safety field', '`inputDirectoryDecision.directoryOrganizationSafety`');
    assertDocsContain('guidance directory safety example', '`guidance-directory-organization-safety-example`');
    assertDocsContain('input directory safety example', '`input-directory-organization-safety-example`');
    assertDocsContain('directory safety example helper', '"helperTool": "organize_font_directory"');
    assertDocsContain('directory safety example default mode', '"helperToolDefaultMode": "safe-preview-plan-only"');
    assertDocsContain('directory safety example source non-destructive flag', '"sourceFilesMovedDeletedOrRewritten": false');
    assertDocsContain('directory safety example staging role', '"outputDirRole": "organized-font-source-staging"');
    assertDocsContain('real corpus suite command', '`npm run smoke:real-corpus-suite -- <font-corpus-dir>`');
    assertDocsContain('real corpus reliability gate decision', '`reliabilityGateDecision`');
    assertDocsContain('real corpus suite test scope', '`testScope`');
    assertDocsContain('real corpus ignored category coverage', '`coverageSummary.unsupportedFileCategoryCoverage`');
    assertDocsContain('real corpus tool coverage summary', '`coverageSummary.toolCoverageSummary`');
    assertDocsContain('real corpus archive handling scope', '`coverageSummary.archiveHandlingScope`');
    assertDocsContain('real corpus output structure audit summary', '`coverageSummary.outputStructureAuditSummary`');
    assertDocsContain('real corpus input directory decision coverage id', '`input-directory-decision`');
    assertDocsContain('real corpus staging directory coverage id', '`staging-directory-decision`');
    assertDocsContain('source safety decision', '`sourceSafetyDecision`');
    assertDocsContain('directory handling decision', '`layoutDecision.directoryHandling`');
    assertDocsContain('staging directory decision', '`stagingDirectoryDecision`');
    assertDocsContain('error response catalog', '`errorResponseCatalog`');
    assertDocsContain('error catalog section', '`error-catalog`');
    assertDocsContain('identity catalog section', '`identity-catalog`');
    assertDocsContain('identity catalog focused request', '`sections: ["identity-catalog"]`');
    assertDocsContain('output catalog section', '`output-catalog`');
    assertDocsContain('output catalog focused request', '`sections: ["output-catalog"]`');
    assertDocsContain('error type field', '`errorType`');
    assertDocsContain('batch split error type', '`errorType: "batch-split-error"`');
    assertDocsContain('configuration error summary type', '`details.summaryType: "configuration-error"`');
    assertDocsContain('workflow-only quick start request', '`sections: ["workflow"]`');
    assertDocsContain('workflow quick start recommended call', '`workflowQuickStart.recommendedCallExample`');
    assertDocsContain('two-call layout preview example', '`two-call-layout-preview`');
    assertDocsContain('recommendedBatchPreviewArgs spread example', '...organization.recommendedBatchPreviewArgs');
    assertDocsContain('recommendedBatchOptions not complete call warning', '`recommendedBatchOptions`');
    assertDocsContain('copy-only reviewed-write route', '`workflowPreset: "reviewed-write"`');
    assertDocsContain('copy-only staging full route example', '`copy-only-staging-to-audited-split`');
    assertDocsContainAny('directory organization safety quick-reference heading', [
      '## Directory Organization Safety Fields',
      '## 目录整理安全字段速查',
    ]);
    assertDocsContain('directory organization safety source destructive field', '`sourceDestructive: false`');
    assertDocsContain('directory organization safety source rewrite field', '`sourceFilesMovedDeletedOrRewritten: false`');
    assertDocsContain('directory organization safety output role field', '`outputDirRole`');
    assertDocsContain('directory organization safety split output flag', '`isSplitOutput`');

    console.log(JSON.stringify({
      ok: true,
      docsChecked: Object.keys(apiDocs),
      toolCount: result.tools.length,
      documentedSchemaPropertyCount: result.tools.reduce((count, tool) => count + Object.keys(tool.inputSchema?.properties || {}).length, 0),
      documentedGuidanceSectionCount: guidance.guidanceView?.availableSections?.length || 0,
      documentedWorkflowPresetCount: guidance.workflowPresets?.length || 0,
    }, null, 2));
  } finally {
    await client.close();
  }
}

export async function runBehaviorDocsSmoke() {
  await assertPublicDocsReadableAndLinked();

  const behaviorDoc = await fs.readFile('BEHAVIOR.zh-CN.md', 'utf8');
  const readmeZh = await fs.readFile('README.md', 'utf8');
  const readmeEn = await fs.readFile('README.en.md', 'utf8');
  const serverSource = await fs.readFile('src/server.js', 'utf8');
  const guidance = getAgentGuidance({ workflow: 'batch', detailLevel: 'full' });
  const assertBehaviorContains = (label, token) => {
    if (!behaviorDoc.includes(token)) {
      throw new Error(`BEHAVIOR.zh-CN.md is missing documented ${label}: ${token}`);
    }
  };
  const samePathLegacyTokens = [
    'preserve the old same-path',
    'preserves old same-stem',
    'old-style batch behavior',
    '保留旧的“同路径',
    '旧式批量行为',
  ];
  for (const [label, text] of [
    ['README.md', readmeZh],
    ['README.en.md', readmeEn],
    ['BEHAVIOR.zh-CN.md', behaviorDoc],
    ['src/server.js', serverSource],
  ]) {
    for (const token of samePathLegacyTokens) {
      if (text.includes(token)) {
        throw new Error(`${label} should describe same-path as path/stem-level dedupe, not as old behavior: ${token}`);
      }
    }
  }
  for (const [label, text] of [
    ['README.md', readmeZh],
    ['README.en.md', readmeEn],
    ['BEHAVIOR.zh-CN.md', behaviorDoc],
    ['src/server.js', serverSource],
  ]) {
    for (const forbiddenTerm of ['legacyOutputCount', 'legacy-output-detected', 'legacy output inference']) {
      if (text.includes(forbiddenTerm)) {
        throw new Error(`${label} should use manifest-missing terminology instead of legacy output terminology: ${forbiddenTerm}`);
      }
    }
  }
  if (!readmeZh.includes('路径/stem 级') || !readmeEn.includes('path/stem-level') || !serverSource.includes('same source path stem')) {
    throw new Error('Expected same-path documentation and schema descriptions to explain path/stem-level dedupe semantics.');
  }
  if (
    !readmeZh.includes('## 目录结构不匹配速查')
    || !readmeZh.includes('不会移动、删除或重写源字体')
    || !readmeZh.includes('不是最终 web-font 拆分结果')
    || !readmeEn.includes('## Source Layout Mismatch Quick Check')
    || !readmeEn.includes('never moves, deletes, or rewrites source fonts')
    || !readmeEn.includes('not final web-font split output')
  ) {
    throw new Error('Expected README files to provide a prominent non-destructive source layout mismatch quick check.');
  }
  if (
    !readmeZh.includes('## 批量自定义速查')
    || !readmeZh.includes('`workflowPreset: "preserve-all"`')
    || !readmeZh.includes('`batchErrorMode: "collect"`')
    || !readmeEn.includes('## Batch Customization Quick Check')
    || !readmeEn.includes('`workflowPreset: "preserve-all"`')
    || !readmeEn.includes('`batchErrorMode: "collect"`')
  ) {
    throw new Error('Expected README files to provide a batch customization quick check.');
  }
  if (
    !readmeZh.includes('## 输出形态速查')
    || !readmeZh.includes('`outputMode: "single-woff2"`')
    || !readmeZh.includes('`outputMode: "copy-original"`')
    || !readmeEn.includes('## Output Shape Quick Check')
    || !readmeEn.includes('`outputMode: "single-woff2"`')
    || !readmeEn.includes('`outputMode: "copy-original"`')
  ) {
    throw new Error('Expected README files to provide an output shape quick check for non-intuitive success results.');
  }

  for (const [label, text] of [
    ['README.md', readmeZh],
    ['README.en.md', readmeEn],
    ['BEHAVIOR.zh-CN.md', behaviorDoc],
  ]) {
    if (text.includes('legacy family/subfamily')) {
      throw new Error(`${label} should describe identity fallback as OpenType name IDs 1/2, not legacy family/subfamily.`);
    }
  }
  if (
    !readmeZh.includes('OpenType name IDs 16/17')
    || !readmeZh.includes('name IDs 1/2')
    || !readmeEn.includes('OpenType name IDs 16/17')
    || !readmeEn.includes('name IDs 1/2')
    || !behaviorDoc.includes('OpenType name IDs 16/17')
    || !behaviorDoc.includes('name IDs 1/2')
  ) {
    throw new Error('Expected README and behavior docs to explain paired OpenType name ID fallback for font-identity.');
  }

  for (const tool of guidance.tools || []) {
    assertBehaviorContains(`tool ${tool.name}`, `\`${tool.name}\``);
  }
  for (const preset of guidance.workflowPresets || []) {
    assertBehaviorContains(`workflowPreset ${preset.id}`, `\`${preset.id}\``);
  }
  for (const token of [
    '`FONT_SPLIT_ROOT`',
    '`guidanceView`',
    '`projectStatusNotice`',
    '`toolSafetyQuickReference`',
    '`recommendedWorkflowPlan`',
    '`nextToolDecisionSummary`',
    '`workflowQuickStart`',
    '`workflowQuickStart.recommendedCallExample`',
    '`sections: ["workflow"]`',
    '`quickStartCallExamples[]`',
    '`configurationRecipes[]`',
    '`batchCustomizationQuickReference[]`',
    '`directoryOrganizationQuickAnswer`',
    '`toolOptionCatalog`',
    '`batchPolicyGuide`',
    '`batchPolicySummary`',
    '`configurationTrace`',
    '`dedupeDecisionSummary`',
    '`identityEvidenceSummary`',
    '`fontIdentityBasisCatalog`',
    '`identityBasis`',
    '`dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts`',
    '`identity-catalog`',
    '`outputStructureCatalog`',
    '`structureSummary.layoutKind`',
    '`structureSummary.issues[].code`',
    '`output-catalog`',
    '`layoutDecision`',
    '`layoutDecision.directoryHandling`',
    '`stagingDirectoryDecision`',
    '`directoryWorkflowSummary`',
    '`directoryWorkflowSummary.workflowSteps[].suggestedArgsField`',
    '`sourceLayoutMismatchSummary`',
    '`sourceLayoutMismatchSummary.decisionChecklist`',
    '`sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs`',
    '`sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs`',
    '`planVisibility`',
    '`directoryWorkflowSummary.planVisibility`',
    '`unsupportedFileCategoryCatalog`',
    '`verificationChecklist[]`',
    '`check:compact`',
    '`compact-check-result`',
    '`smoke:real-corpus-suite`',
    '`reliabilityGateDecision`',
    '`corpusCountGuide`',
    '`humanSummary`',
    '`testScope`',
    '`functionalCoverage[]`',
    '`input-directory-decision`',
    '`staging-directory-decision`',
    '`coverageSummary.unsupportedFileCategoryCoverage`',
    '`coverageSummary.toolCoverageSummary`',
    '`coverageSummary.archiveHandlingScope`',
    '`coverageSummary.outputStructureAuditSummary`',
    '`runSummaries`',
    '`omittedDetailFields`',
    '`directoryWorkflowDecisionMatrix[]`',
    '`directoryWorkflowExamples[]`',
    '`copy-only-staging-to-audited-split`',
    '`safeInvocationTemplates[]`',
    '`localVerificationOutputGuide`',
    '`completionReportGuide`',
    '`forbiddenClaims[]`',
    '`conciseReportTemplate[]`',
    '`errorResponseCatalog`',
    '`toolResponseFieldCatalog`',
    '`workflowPreset`',
    '`dryRun`',
    '`includeResults`',
    '`includePlan`',
    '`parseFonts`',
    '`copyInvalidFonts`',
    '`overwriteExisting`',
    '`safetySummary`',
    '`inputDirectoryDecision`',
    '`sourceDestructive`',
    '`writesSourceTree`',
    '`writesOutputTree`',
    '`outputTreeInsideInputTree`',
    '`mayOverwriteOutputTree`',
    '`recommendedBatchPreviewArgs`',
    '`recommendedBatchPreviewArgs.maxFiles`',
    '`recommendedNextActions[]`',
    '`recommendedNextActions[].suggestedArgsField`',
    '`recommendedNextActions[].suggestedArgs.maxFiles`',
    '`successCriteria`',
    '`planActionSummary`',
    '`batchDecision`',
    '`organizationDecision`',
    '`directoryWorkflowSummary`',
    '`unsupportedFileDecision`',
    '`unsupportedFileSummary`',
    '`unsupportedFileSummary.byExtension[]`',
    '`unsupportedFileSummary.byCategory[]`',
    '`unsupportedFileSummary.categoryDetails[]`',
    '`unsupportedFileSummary.handlingSummary`',
    '`unsupportedFileSummary.examples[]`',
    '`outputRoleDecision`',
    '`outputStructureDecision`',
    '`auditStatus`',
    '`auditPassed`',
    '`auditBlockingReasons[]`',
    '`structureSummary`',
    '`missingManifestCount`',
    '`maxFilesHit`',
    '`batchWarnings[]`',
    '`organizationWarnings[]`',
    '`inspectionWarnings[]`',
    '`batchGroupBy`',
    '`batchNamingMode`',
    '`batchDedupeMode`',
    '`batchErrorMode`',
    '`skipMode`',
    '`debugBatchDecisions`',
    '`sourceSafetyDecision`',
    '`font-identity`',
    '`glyphCount`',
    '`resultType`',
    '`outputMode`',
    '`performedSplit`',
    '`usedFallback`',
    '`ok: true`',
    '`splitFailureAction`',
    '`smallGlyphAction`',
    '`details.summaryType`',
    '`errorType`',
    '`batch-split-error`',
    '`configuration-error`',
  ]) {
    assertBehaviorContains(`high-risk behavior token ${token}`, token);
  }
  for (const warningCode of [
    'input-scan-truncated',
    'output-structure-issues',
    'missing-manifests',
    'organization-dry-run',
    'organization-writes-output',
    'font-parsing-skipped',
    'output-overwrite-enabled',
    'unsupported-files-ignored',
    'duplicate-fonts-skipped',
    'output-inside-input',
    'organized-staging-not-split-output',
  ]) {
    assertBehaviorContains(`warning code ${warningCode}`, `\`${warningCode}\``);
  }
  for (const debugEvent of ['dedupe-drop', 'dedupe-replace', 'naming', 'skip-check', 'error']) {
    assertBehaviorContains(`debugBatchDecisions event ${debugEvent}`, `\`${debugEvent}\``);
  }

  console.log(JSON.stringify({
    ok: true,
    toolCount: guidance.tools?.length || 0,
    documentedWorkflowPresetCount: guidance.workflowPresets?.length || 0,
    checkedHighRiskTokenCount: 48,
    checkedWarningCodeCount: 11,
    checkedDebugEventCount: 5,
  }, null, 2));
}
