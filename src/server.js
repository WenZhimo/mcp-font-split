#!/usr/bin/env node
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BATCH_DEDUPE_MODES, BATCH_ERROR_MODES, BATCH_GROUP_BY_MODES, BATCH_NAMING_MODES, GUIDANCE_DETAIL_LEVELS, GUIDANCE_SECTION_NAMES, GUIDANCE_WORKFLOWS, OVERSIZED_KERN_ACTIONS, SKIP_MODES, SMALL_GLYPH_ACTIONS, SPLIT_FAILURE_ACTIONS, WORKFLOW_PRESET_NAMES, getAgentGuidance, getRuntimeStatus, inspectFontInputs, inspectSplitOutput, organizeFontDirectory, splitFont, splitFontBatch } from './font-split.js';
import { MCP_TOOL_OUTPUT_SCHEMAS } from './mcp-interface-contract.js';
import { errorMessageText, errorText, jsonText } from './mcp-response.js';

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
  oversizedKernAction: z.enum(OVERSIZED_KERN_ACTIONS).optional().describe('How to handle oversized kern tables. Default: preserve. Use strip to explicitly allow removing an oversized kern table before splitting.'),
  smallGlyphAction: z.enum(SMALL_GLYPH_ACTIONS).optional().describe('How to handle very small fonts. Default: subset. Use single-woff2 to emit a one-file fallback, or copy-original to copy the original and write metadata without generating web-font output.'),
  smallGlyphThreshold: z.number().int().positive().optional().describe('Glyph-count threshold used by smallGlyphAction fallback modes. Default: 50.'),
  splitFailureAction: z.enum(SPLIT_FAILURE_ACTIONS).optional().describe('What to do if cn-font-split fails. Default: error. Use single-woff2 to explicitly allow a one-file fallback after split failure.'),
};

const BatchPolicyOptions = {
  workflowPreset: z.enum(WORKFLOW_PRESET_NAMES).optional().describe('Named configuration preset applied before explicit arguments. Omit workflowPreset to use raw tool defaults. safe-preview is no-write, reviewed-write is for after preview review, structure-first is fast/no-write, source-layout groups by source folders, metadata-family groups by font metadata, and preserve-all disables dedupe. Explicit options override preset values.'),
  skipMode: z.enum(SKIP_MODES).optional().describe('Batch incremental mode. Default: manifest. manifest compares source and effective options, and force always reprocesses.'),
  batchGroupBy: z.enum(BATCH_GROUP_BY_MODES).optional().describe('Batch family directory grouping mode. Default: auto. auto preserves directory-first behavior for nested inputs, source-dir groups by source directory, and font-family groups by internal font metadata.'),
  batchNamingMode: z.enum(BATCH_NAMING_MODES).optional().describe('Batch output naming mode. Default: numeric-suffix. plain keeps bare fontBaseName, numeric-suffix appends -1/-2 only on real conflicts, and source-suffix appends a source-derived suffix.'),
  batchDedupeMode: z.enum(BATCH_DEDUPE_MODES).optional().describe('Batch dedupe mode. Default: font-identity. none disables dedupe, same-path only dedupes multi-format files with the same source path stem, and font-identity dedupes equivalent fonts across formats.'),
  batchErrorMode: z.enum(BATCH_ERROR_MODES).optional().describe('Batch error mode. Default: fail-after. collect returns ok:true with errors[], fail-fast throws on the first per-font error, and fail-after throws after processing selected fonts if any errors occurred.'),
  debugBatchDecisions: z.boolean().optional().describe('Emit structured batch decision logs for dedupe, naming, skip, and error diagnosis. Default: false.'),
};

const server = new McpServer({
  name: 'font-split-mcp',
  version: packageJson.version,
});
server.createToolError = (message) => errorMessageText(message);

const DocumentationResources = [
  {
    name: 'readme-zh-cn',
    uri: 'font-split://docs/readme.zh-CN',
    title: 'README zh-CN',
    fileName: 'README.md',
    description: 'Chinese project entry README.',
  },
  {
    name: 'readme-en',
    uri: 'font-split://docs/readme.en',
    title: 'README English',
    fileName: 'README.en.md',
    description: 'English project entry README.',
  },
  {
    name: 'api-en',
    uri: 'font-split://docs/api.en',
    title: 'API Reference English',
    fileName: 'API.md',
    description: 'English MCP tool and response field reference.',
  },
  {
    name: 'api-zh-cn',
    uri: 'font-split://docs/api.zh-CN',
    title: 'API Reference zh-CN',
    fileName: 'API.zh-CN.md',
    description: 'Chinese MCP tool and response field reference.',
  },
  {
    name: 'behavior-zh-cn',
    uri: 'font-split://docs/behavior.zh-CN',
    title: 'Behavior Notes zh-CN',
    fileName: 'BEHAVIOR.zh-CN.md',
    description: 'Chinese high-risk behavior and workflow notes.',
  },
  {
    name: 'behavior-en',
    uri: 'font-split://docs/behavior.en',
    title: 'Behavior Notes English',
    fileName: 'BEHAVIOR.en.md',
    description: 'English high-risk behavior, stability, and workflow notes.',
  },
];

async function readDocumentationResource(uri, fileName) {
  const text = await fs.readFile(new URL(`../${fileName}`, import.meta.url), 'utf8');
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/markdown',
        text,
      },
    ],
  };
}

for (const resource of DocumentationResources) {
  server.registerResource(
    resource.name,
    resource.uri,
    {
      title: resource.title,
      description: resource.description,
      mimeType: 'text/markdown',
    },
    (uri) => readDocumentationResource(uri, resource.fileName),
  );
}

server.registerPrompt(
  'safe-batch-workflow',
  {
    title: 'Safe Batch Workflow',
    description: 'Plan a safe inspect -> preview -> reviewed write -> audit workflow for batch font splitting.',
    argsSchema: {
      inputDir: z.string().optional().describe('Source font directory inside FONT_SPLIT_ROOT.'),
      outputRoot: z.string().optional().describe('Split output root inside FONT_SPLIT_ROOT.'),
    },
  },
  (args) => {
    const inputDir = args.inputDir || '<font-source-dir>';
    const outputRoot = args.outputRoot || '<split-output-root>';
    return {
      description: 'Safe workflow prompt for mcp-font-split batch runs.',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Use mcp-font-split safely for a batch font split.',
              `1. Call inspect_font_inputs with inputDir: "${inputDir}", includeFiles:false, and an appropriate maxFiles.`,
              '2. If layout is uncertain, call organize_font_directory with workflowPreset:"safe-preview".',
              `3. Call split_font_batch with inputDir: "${inputDir}", outputRoot: "${outputRoot}", workflowPreset:"safe-preview", includeResults:true.`,
              '4. Inspect sourceSafetyDecision, safetySummary, batchDecision, planned, batchWarnings, maxFilesHit, dedupeDecisionSummary, errorCount, and errors.',
              '5. Only after review, call split_font_batch with workflowPreset:"reviewed-write".',
              `6. Audit "${outputRoot}" with inspect_split_output using includeFiles:false and includeFamilies:false before reporting success.`,
            ].join('\n'),
          },
        },
      ],
    };
  },
);

server.registerTool(
  'get_agent_guidance',
  {
    title: 'Get AI agent usage guidance',
    description: 'Call first to choose a safe font-splitting workflow. Returns compact or focused guidance, safety defaults, catalogs, and response fields to inspect.',
    inputSchema: {
      workflow: z.enum(GUIDANCE_WORKFLOWS).optional().describe('Guidance focus. Default: overview.'),
      detailLevel: z.enum(GUIDANCE_DETAIL_LEVELS).optional().describe('Response detail. compact keeps workflow essentials and omits bulky catalogs/examples unless requested; full returns all guidance sections. Default: compact.'),
      sections: z.array(z.enum(GUIDANCE_SECTION_NAMES)).optional().describe('Optional focused guidance sections to return. When set, this overrides the detailLevel default section set.'),
    },
    outputSchema: MCP_TOOL_OUTPUT_SCHEMAS.get_agent_guidance,
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
    outputSchema: MCP_TOOL_OUTPUT_SCHEMAS.get_runtime_status,
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
    outputSchema: MCP_TOOL_OUTPUT_SCHEMAS.split_font,
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
    description: 'Batch scan, dedupe, name, preview, or split fonts. dryRun defaults to true; write only with workflowPreset:"reviewed-write" or reviewed dryRun:false. Inspect sourceSafetyDecision, batchDecision, and batchWarnings.',
    inputSchema: {
      inputDir: z.string().optional().describe('Directory to scan, relative to the font workspace. Defaults to the workspace root.'),
      outputRoot: z.string().optional().describe('Directory to place per-font output folders. Defaults to split-output.'),
      limit: z.number().int().positive().max(50000).optional().describe('Maximum fonts to process after dedupe. Defaults to 20.'),
      maxFiles: z.number().int().positive().max(50000).optional().describe('Maximum files to scan. Defaults to 5000.'),
      includeResults: z.boolean().optional().describe('Include per-font result objects in the response. Default: true. Set false for large batch runs that only need summary counts and errors.'),
      dryRun: z.boolean().optional().describe('Preview scan, dedupe, naming, and skip decisions without writing output files. Default: true. Set false only after reviewing a preview, or use workflowPreset:"reviewed-write".'),
      ...Object.fromEntries(Object.entries(SplitFontOptions).filter(([key]) => !['fontPath', 'outDir'].includes(key))),
      ...BatchPolicyOptions,
    },
    outputSchema: MCP_TOOL_OUTPUT_SCHEMAS.split_font_batch,
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
    description: 'Read-only preflight for source fonts. Reports counts, ignored files, invalid font-like files, layout, identity hints, and safe next-step preview arguments.',
    inputSchema: {
      inputDir: z.string().optional().describe('Directory to scan, relative to the font workspace. Defaults to the workspace root.'),
      maxFiles: z.number().int().positive().max(50000).optional().describe('Maximum source files to scan. Defaults to 50000.'),
      includeFiles: z.boolean().optional().describe('Include per-font inspection entries in files[]. Default: true. Set false for compact summaries.'),
    },
    outputSchema: MCP_TOOL_OUTPUT_SCHEMAS.inspect_font_inputs,
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
    description: 'Plan or copy-organize source fonts into source-like staging. Defaults to dryRun true, never moves/deletes source files, and copy writes only to outputDir after review.',
    inputSchema: {
      inputDir: z.string().optional().describe('Directory to scan, relative to the font workspace. Defaults to the workspace root.'),
      outputDir: z.string().optional().describe('Directory for organized copies, relative to the font workspace. Defaults to organized-fonts. Must differ from inputDir.'),
      maxFiles: z.number().int().positive().max(50000).optional().describe('Maximum source files to scan. Defaults to 50000.'),
      workflowPreset: z.enum(WORKFLOW_PRESET_NAMES).optional().describe('Named configuration preset applied before explicit arguments. Omit workflowPreset to use raw organization defaults. safe-preview is a no-write parsed plan, reviewed-write copies into outputDir after review, structure-first is a fast metadata-free dry-run, source-layout groups by source folders, metadata-family groups by font metadata, and preserve-all disables dedupe. Explicit options override preset values.'),
      dryRun: z.boolean().optional().describe('Plan only without writing directories or files. Default: true. Set false only after reviewing plan[] and organizationWarnings[].'),
      includePlan: z.boolean().optional().describe('Include per-font plan[] entries. Default: true. Set false for compact summaries; directoryWorkflowSummary.planVisibility then explains which summary fields remain and how to rerun with includePlan:true before exact per-file review.'),
      parseFonts: z.boolean().optional().describe('Read font metadata for identity dedupe, glyph counts, invalid-font detection, and font-family grouping. Default: true. Set false for a faster structure-only plan when metadata parsing is expensive or noisy.'),
      batchGroupBy: z.enum(BATCH_GROUP_BY_MODES).optional().describe('How organized copy folders are grouped. Default: auto. Uses the same meanings as split_font_batch.'),
      batchNamingMode: z.enum(BATCH_NAMING_MODES).optional().describe('How copied font filenames avoid collisions. Default: numeric-suffix.'),
      batchDedupeMode: z.enum(BATCH_DEDUPE_MODES).optional().describe('How equivalent fonts are deduped before copy planning. Default: font-identity.'),
      copyInvalidFonts: z.boolean().optional().describe('Copy files with supported font extensions even when metadata parsing fails. Default: false.'),
      overwriteExisting: z.boolean().optional().describe('Allow replacing matching files in outputDir. Default: false. Source files are still never modified.'),
    },
    outputSchema: MCP_TOOL_OUTPUT_SCHEMAS.organize_font_directory,
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
    description: 'Call this to summarize and structurally inspect generated cn-font-split output files in an output directory. Inspect outputRoleDecision first: if outDir contains font-organization-manifest.json, it is organize_font_directory staging rather than generated split output, so inspect it with inspect_font_inputs and split_font_batch safe-preview instead. Then inspect outputStructureDecision, auditStatus, auditPassed, auditBlockingReasons, structureSummary, maxFilesHit, and inspectionWarnings before treating an audit as complete; use includeFiles:false and includeFamilies:false for compact large-output summaries.',
    inputSchema: {
      outDir: z.string().optional().describe('Output directory to inspect, relative to the font workspace. Defaults to split-output.'),
      maxFiles: z.number().int().positive().max(200000).optional().describe('Maximum output files to inspect. Defaults to 200000.'),
      includeFiles: z.boolean().optional().describe('Include flat files[] entries in the response. Default: true. Set false for compact summaries.'),
      includeFamilies: z.boolean().optional().describe('Include structured families[] inventory in the response. Default: true. Set false for compact summaries.'),
    },
    outputSchema: MCP_TOOL_OUTPUT_SCHEMAS.inspect_split_output,
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
