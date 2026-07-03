export function buildOutputResultShapeQuickReference() {
  return {
    summaryType: 'output-result-shape-quick-reference',
    purpose: 'Fast answer for what a successful split response actually produced, so agents do not treat ok:true as proof of normal web-font subset output.',
    inspectFields: ['ok', 'resultType', 'outputMode', 'performedSplit', 'usedFallback', 'skipped', 'skipReason', 'warnings', 'batchDecision', 'skipMode', 'skippedExisting', 'skippedByManifest', 'planned', 'planned[].wouldProcess', 'planned[].skipReason', 'errorCount', 'errors', 'manifestPath'],
    resultShapes: [
      {
        id: 'subset-output',
        when: {
          outputMode: 'subset',
          performedSplit: true,
        },
        meaning: 'Normal multi-subset web-font output was produced.',
        agentAction: 'After a real write, audit the output directory with inspect_split_output before reporting completion.',
        successEvidence: ['manifestPath', 'inspect_split_output.outputStructureDecision.status', 'inspect_split_output.structureSummary.conforms'],
      },
      {
        id: 'single-woff2-fallback',
        when: {
          outputMode: 'single-woff2',
          usedFallback: true,
        },
        meaning: 'Normal multi-subset output did not happen; the result fell back to one WOFF2 output.',
        agentAction: 'Disclose the fallback, inspect warnings and resultType, and do not describe this as normal multi-subset splitting.',
        successEvidence: ['resultType', 'warnings', 'manifestPath'],
      },
      {
        id: 'copy-original-record',
        when: {
          outputMode: 'copy-original',
          skipped: true,
          usedFallback: false,
        },
        meaning: 'No web-font split output was generated; the original font was copied/recorded with metadata because the splitter was intentionally bypassed.',
        agentAction: 'Do not report this as web-font output. Explain copy-original behavior and inspect resultType, skipped, skipReason, and manifestPath.',
        successEvidence: ['resultType', 'skipped', 'skipReason', 'manifestPath'],
      },
      {
        id: 'single-font-split-skipped',
        when: {
          skipped: true,
          skipReason: '<present>',
        },
        meaning: 'The single-font processing path intentionally bypassed normal multi-subset splitting, usually for small-glyph fallback or copy-original behavior.',
        agentAction: 'Interpret skipped together with outputMode and usedFallback; do not assume it means batch existing-output skip.',
        successEvidence: ['outputMode', 'usedFallback', 'skipReason', 'manifestPath'],
      },
      {
        id: 'batch-existing-output-skips',
        when: {
          skippedExisting: '>0',
        },
        meaning: 'One or more selected batch fonts were not reprocessed because existing output matched the selected skipMode.',
        agentAction: 'Inspect skipMode, skippedExisting, skippedByManifest, batchDecision, and audit existing output before relying on it.',
        successEvidence: ['skipMode', 'skippedExisting', 'skippedByManifest', 'batchDecision', 'inspect_split_output.outputStructureDecision.status'],
      },
      {
        id: 'dry-run-existing-output-skip-plan',
        when: {
          dryRun: true,
          'planned[].wouldProcess': false,
          'planned[].skipReason': '<present>',
        },
        meaning: 'A batch dry-run planned to skip a selected font, usually because matching existing output was detected.',
        agentAction: 'Review planned[] before writing; if reprocessing is intended, rerun with skipMode force.',
        successEvidence: ['planned[].wouldProcess', 'planned[].skipReason', 'skipMode'],
      },
      {
        id: 'batch-partial-errors',
        when: {
          ok: true,
          errorCount: '>0',
        },
        meaning: 'The batch completed according to its error policy, but one or more fonts failed.',
        agentAction: 'Inspect batchErrorMode, errorCount, and errors[]; do not report full batch success until failures are resolved or explicitly accepted.',
        successEvidence: ['batchDecision', 'errorCount', 'errors'],
      },
    ],
    nonIntuitiveBehavior: [
      'ok:true is not proof of normal subset output.',
      'single-woff2 is a fallback path; copy-original is a metadata/copy record path. Neither is normal multi-subset web-font splitting.',
      'In split_font results, skipped means normal multi-subset splitting was intentionally bypassed; in split_font_batch, existing-output skips are summarized by skippedExisting and skippedByManifest.',
      'A batch existing-output skip can be acceptable only when the existing output still passes the relevant manifest or output audit checks.',
      'A batch can return ok:true with collected errors when batchErrorMode is collect; agents must inspect errorCount and errors[].',
    ],
  };
}
