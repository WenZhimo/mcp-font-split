#!/usr/bin/env node
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getAgentGuidance, getRuntimeStatus, inspectFontInputs, inspectSplitOutput, organizeFontDirectory, splitFont, splitFontBatch } from './font-split.js';
import { errorText, jsonText } from './mcp-response.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const SplitFontOptions = {
  fontPath: z.string().describe('Font file path relative to FONT_SPLIT_ROOT, or an absolute path inside it. If FONT_SPLIT_ROOT is not configured, ask the user which font workspace directory to use before processing private/local fonts.'),
  outDir: z.string().optional().describe('Output directory relative to FONT_SPLIT_ROOT. Defaults to split-output/<font-family>.'),
  fontFamily: z.string().optional().describe('CSS font-family value.'),
  fontWeight: z.string().optional().describe('CSS font-weight value.'),
  fontStyle: z.string().optional().describe('CSS font-style value.'),
  fontDisplay: z.string().optional().describe('CSS font-display value.'),
  cssFileName: z.string().optional().describe('Generated CSS file name.'),
  chunkSize: z.number().int().positive().optional().describe('Target chunk size in bytes.'),
  chunkSizeTolerance: z.number().positive().optional().describe('Allowed chunk size tolerance.'),
  maxAllowSubsetsCount: z.number().int().positive().optional().describe('Maximum number of output subsets.'),
  languageAreas: z.boolean().optional().describe('Enable language-area optimization.'),
  testHtml: z.boolean().optional().describe('Generate a test HTML file.'),
  reporter: z.boolean().optional().describe('Generate reporter data.'),
  previewText: z.string().optional().describe('Preview SVG text.'),
  previewName: z.string().optional().describe('Preview SVG file name.'),
  renameOutputFont: z.string().optional().describe('Output font filename template, e.g. font_[hash:6].[ext].'),
  buildMode: z.string().optional().describe('cn-font-split build mode.'),
  multiThreads: z.boolean().optional().describe('Enable multi-thread processing when supported.'),
  fontFeature: z.boolean().optional().describe('Enable font feature processing.'),
  reduceMins: z.boolean().optional().describe('Reduce minimum subset sizes.'),
  autoSubset: z.boolean().optional().describe('Automatically create subsets.'),
  subsetRemainChars: z.boolean().optional().describe('Automatically include remaining undeclared characters.'),
  subsets: z.array(z.array(z.number().int().nonnegative())).optional().describe('Explicit unicode codepoint groups to keep in each subset.'),
  oversizedKernAction: z.enum(['preserve', 'strip']).optional().describe('How to handle oversized kern tables. Default: preserve. Use strip to explicitly allow removing an oversized kern table before splitting.'),
  smallGlyphAction: z.enum(['subset', 'single-woff2', 'copy-original']).optional().describe('How to handle very small fonts. Default: subset. Use single-woff2 to emit a one-file fallback, or copy-original to copy the original and write metadata without generating web-font output.'),
  smallGlyphThreshold: z.number().int().positive().optional().describe('Glyph-count threshold used by smallGlyphAction fallback modes. Default: 50.'),
  splitFailureAction: z.enum(['error', 'single-woff2']).optional().describe('What to do if cn-font-split fails. Default: error. Use single-woff2 to explicitly allow a one-file fallback after split failure.'),
};

const BatchPolicyOptions = {
  workflowPreset: z.enum(['default', 'safe-preview', 'reviewed-write', 'structure-first', 'source-layout', 'metadata-family', 'preserve-all']).optional().describe('Named configuration preset applied before explicit arguments. default keeps current defaults, safe-preview is no-write, reviewed-write is for after preview review, structure-first is fast/no-write, source-layout groups by source folders, metadata-family groups by font metadata, and preserve-all disables dedupe. Explicit options override preset values.'),
  skipMode: z.enum(['manifest', 'force']).optional().describe('Batch incremental mode. Default: manifest. manifest compares source and effective options, and force always reprocesses.'),
  batchGroupBy: z.enum(['auto', 'source-dir', 'font-family']).optional().describe('Batch family directory grouping mode. Default: auto. auto preserves directory-first behavior for nested inputs, source-dir groups by source directory, and font-family groups by internal font metadata.'),
  batchNamingMode: z.enum(['plain', 'numeric-suffix', 'source-suffix']).optional().describe('Batch output naming mode. Default: numeric-suffix. plain keeps bare fontBaseName, numeric-suffix appends -1/-2 only on real conflicts, and source-suffix appends a source-derived suffix.'),
  batchDedupeMode: z.enum(['none', 'same-path', 'font-identity']).optional().describe('Batch dedupe mode. Default: font-identity. none disables dedupe, same-path preserves old same-stem dedupe, and font-identity dedupes equivalent fonts across formats.'),
  batchErrorMode: z.enum(['collect', 'fail-fast', 'fail-after']).optional().describe('Batch error mode. Default: fail-after. collect returns ok:true with errors[], fail-fast throws on the first per-font error, and fail-after throws after processing selected fonts if any errors occurred.'),
  debugBatchDecisions: z.boolean().optional().describe('Emit structured batch decision logs for dedupe, naming, skip, and error diagnosis. Default: false.'),
};

const server = new McpServer({
  name: 'font-split-mcp',
  version: packageJson.version,
});

server.registerTool(
  'get_agent_guidance',
  {
    title: 'Get AI agent usage guidance',
    description: 'Call this first when an AI coding assistant needs to choose a safe font-splitting workflow. It returns workspace path rules, configurationRecipes, batchPolicyGuide, unsupportedFileCategoryCatalog, directoryWorkflowDecisionMatrix, directoryWorkflowExamples, safeInvocationTemplates, warningCodeCatalog, toolResponseFieldCatalog, recommended tool order, defaults, response fields to inspect, and successCriteria to satisfy before advancing. Use detailLevel or sections for a compact or focused response.',
    inputSchema: {
      workflow: z.enum(['overview', 'single', 'batch', 'inspect', 'organize']).optional().describe('Guidance focus. Default: overview.'),
      detailLevel: z.enum(['compact', 'full']).optional().describe('Response detail. compact keeps workflow essentials and omits bulky catalogs/examples unless requested; full returns all guidance sections. Default: compact.'),
      sections: z.array(z.enum(['workspace', 'tools', 'defaults', 'recommendations', 'directory-workflows', 'examples', 'verification', 'warning-catalog', 'field-catalog', 'safe-templates', 'response-fields', 'path-rules', 'workflow'])).optional().describe('Optional focused guidance sections to return. When set, this overrides the detailLevel default section set.'),
    },
  },
  async (args) => {
    try {
      return jsonText(getAgentGuidance(args));
    } catch (error) {
      return errorText(error);
    }
  },
);

server.registerTool(
  'get_runtime_status',
  {
    title: 'Get runtime status',
    description: 'Call this when an AI coding assistant needs to diagnose setup before processing fonts. It checks the font workspace, Node engine compatibility, package versions, cn-font-split runtime details, and WASM availability without writing files, then returns recommendedActions for remediation.',
    inputSchema: {},
  },
  async () => {
    try {
      return jsonText(await getRuntimeStatus());
    } catch (error) {
      return errorText(error);
    }
  },
);

server.registerTool(
  'split_font',
  {
    title: 'Split a font into web-font chunks',
    description: 'Call this when the user wants to split one local TTF/OTF/TTC/OTC/WOFF/WOFF2 font into cn-font-split web font output files. This writes output files; inspect resultType, outputMode, performedSplit, usedFallback, warnings, and manifestPath before claiming success. All paths must stay inside the configured font workspace.',
    inputSchema: SplitFontOptions,
  },
  async (args) => {
    try {
      return jsonText(await splitFont(args));
    } catch (error) {
      return errorText(error);
    }
  },
);

server.registerTool(
  'split_font_batch',
  {
    title: 'Batch split fonts under a directory',
    description: 'Call this when the user wants to split many local font files under a directory. dryRun defaults to false and can write output files; agents should set dryRun:true with includeResults:true to preview scan, dedupe, naming, skip decisions, safetySummary, batchPolicySummary, outputTreeInsideInputTree, batchDecision, and batchWarnings before writing. Source font files are never moved or deleted, but writesSourceTree can be true when outputRoot is inside or equal to inputDir.',
    inputSchema: {
      inputDir: z.string().optional().describe('Directory to scan, relative to the font workspace. Defaults to the workspace root.'),
      outputRoot: z.string().optional().describe('Directory to place per-font output folders. Defaults to split-output.'),
      limit: z.number().int().positive().max(50000).optional().describe('Maximum fonts to process after dedupe. Defaults to 20.'),
      maxFiles: z.number().int().positive().max(50000).optional().describe('Maximum files to scan. Defaults to 5000.'),
      includeResults: z.boolean().optional().describe('Include per-font result objects in the response. Default: true. Set false for large batch runs that only need summary counts and errors.'),
      dryRun: z.boolean().optional().describe('Preview scan, dedupe, naming, and skip decisions without writing output files. Default: false.'),
      ...Object.fromEntries(Object.entries(SplitFontOptions).filter(([key]) => !['fontPath', 'outDir'].includes(key))),
      ...BatchPolicyOptions,
    },
  },
  async (args) => {
    try {
      return jsonText(await splitFontBatch(args));
    } catch (error) {
      return errorText(error);
    }
  },
);

server.registerTool(
  'inspect_font_inputs',
  {
    title: 'Inspect input fonts before splitting',
    description: 'Call this before large batch runs to scan supported font files, validate basic font metadata parsing, and report identity keys, glyph counts, and invalid font-like files without writing output.',
    inputSchema: {
      inputDir: z.string().optional().describe('Directory to scan, relative to the font workspace. Defaults to the workspace root.'),
      maxFiles: z.number().int().positive().max(50000).optional().describe('Maximum source files to scan. Defaults to 50000.'),
      includeFiles: z.boolean().optional().describe('Include per-font inspection entries in files[]. Default: true. Set false for compact summaries.'),
    },
  },
  async (args) => {
    try {
      return jsonText(await inspectFontInputs(args));
    } catch (error) {
      return errorText(error);
    }
  },
);

server.registerTool(
  'organize_font_directory',
  {
    title: 'Plan or copy-organize a font directory',
    description: 'Call this when the source font directory layout does not match the desired batch grouping. It defaults to dryRun true and is source-non-destructive: it never moves or deletes source files, and when dryRun is false it only copies selected fonts into outputDir. Inspect safetySummary, batchPolicySummary, directoryWorkflowSummary, and outputTreeInsideInputTree because writesSourceTree can be true when outputDir is inside or equal to inputDir.',
    inputSchema: {
      inputDir: z.string().optional().describe('Directory to scan, relative to the font workspace. Defaults to the workspace root.'),
      outputDir: z.string().optional().describe('Directory for organized copies, relative to the font workspace. Defaults to organized-fonts. Must differ from inputDir.'),
      maxFiles: z.number().int().positive().max(50000).optional().describe('Maximum source files to scan. Defaults to 50000.'),
      workflowPreset: z.enum(['default', 'safe-preview', 'reviewed-write', 'structure-first', 'source-layout', 'metadata-family', 'preserve-all']).optional().describe('Named configuration preset applied before explicit arguments. safe-preview is a no-write parsed plan, reviewed-write copies into outputDir after review, structure-first is a fast metadata-free dry-run, source-layout groups by source folders, metadata-family groups by font metadata, and preserve-all disables dedupe. Explicit options override preset values.'),
      dryRun: z.boolean().optional().describe('Plan only without writing directories or files. Default: true. Set false only after reviewing plan[] and organizationWarnings[].'),
      includePlan: z.boolean().optional().describe('Include per-font plan[] entries. Default: true. Set false for compact summaries; directoryWorkflowSummary.planVisibility then explains which summary fields remain and how to rerun with includePlan:true before exact per-file review.'),
      parseFonts: z.boolean().optional().describe('Read font metadata for identity dedupe, glyph counts, invalid-font detection, and font-family grouping. Default: true. Set false for a faster structure-only plan when metadata parsing is expensive or noisy.'),
      batchGroupBy: z.enum(['auto', 'source-dir', 'font-family']).optional().describe('How organized copy folders are grouped. Default: auto. Uses the same meanings as split_font_batch.'),
      batchNamingMode: z.enum(['plain', 'numeric-suffix', 'source-suffix']).optional().describe('How copied font filenames avoid collisions. Default: numeric-suffix.'),
      batchDedupeMode: z.enum(['none', 'same-path', 'font-identity']).optional().describe('How equivalent fonts are deduped before copy planning. Default: font-identity.'),
      copyInvalidFonts: z.boolean().optional().describe('Copy files with supported font extensions even when metadata parsing fails. Default: false.'),
      overwriteExisting: z.boolean().optional().describe('Allow replacing matching files in outputDir. Default: false. Source files are still never modified.'),
    },
  },
  async (args) => {
    try {
      return jsonText(await organizeFontDirectory(args));
    } catch (error) {
      return errorText(error);
    }
  },
);

server.registerTool(
  'inspect_split_output',
  {
    title: 'Inspect split font output',
    description: 'Call this to summarize and structurally inspect generated cn-font-split output files in an output directory. Inspect auditStatus, auditPassed, auditBlockingReasons, structureSummary, maxFilesHit, and inspectionWarnings before treating an audit as complete; use includeFiles:false and includeFamilies:false for compact large-output summaries.',
    inputSchema: {
      outDir: z.string().optional().describe('Output directory to inspect, relative to the font workspace. Defaults to split-output.'),
      maxFiles: z.number().int().positive().max(200000).optional().describe('Maximum output files to inspect. Defaults to 200000.'),
      includeFiles: z.boolean().optional().describe('Include flat files[] entries in the response. Default: true. Set false for compact summaries.'),
      includeFamilies: z.boolean().optional().describe('Include structured families[] inventory in the response. Default: true. Set false for compact summaries.'),
    },
  },
  async (args) => {
    try {
      return jsonText(await inspectSplitOutput(args));
    } catch (error) {
      return errorText(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
