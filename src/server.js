#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getAgentGuidance, inspectFontInputs, inspectSplitOutput, splitFont, splitFontBatch } from './font-split.js';

const FontSplitOptions = {
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
  strictMode: z.boolean().optional().describe('Convenience strict defaults. In batch mode, unset skipMode becomes manifest and unset batchErrorMode becomes fail-after. Explicit options still override this. Default: false.'),
  skipMode: z.enum(['legacy-css', 'manifest', 'force']).optional().describe('Batch incremental mode. legacy-css preserves the old result.css existence check, manifest compares source and effective options, and force always reprocesses.'),
  batchNamingMode: z.enum(['plain', 'numeric-suffix', 'source-suffix']).optional().describe('Batch output naming mode. Default: numeric-suffix. plain keeps bare fontBaseName, numeric-suffix appends -1/-2 only on real conflicts, and source-suffix appends a source-derived suffix.'),
  batchDedupeMode: z.enum(['none', 'same-path', 'font-identity']).optional().describe('Batch dedupe mode. Default: font-identity. none disables dedupe, same-path preserves old same-stem dedupe, and font-identity dedupes equivalent fonts across formats.'),
  batchErrorMode: z.enum(['collect', 'fail-fast', 'fail-after']).optional().describe('Batch error mode. Default: collect. collect returns ok:true with errors[], fail-fast throws on the first per-font error, and fail-after throws after processing selected fonts if any errors occurred.'),
  debugBatchDecisions: z.boolean().optional().describe('Emit structured batch decision logs for dedupe, naming, skip, and error diagnosis. Default: false.'),
};

const server = new McpServer({
  name: 'font-split-mcp',
  version: '0.1.0',
});

function jsonText(value) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorText(error) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

server.registerTool(
  'get_agent_guidance',
  {
    title: 'Get AI agent usage guidance',
    description: 'Call this first when an AI coding assistant needs to choose a safe font-splitting workflow. It returns workspace path rules, recommended tool order, defaults, and response fields to inspect.',
    inputSchema: {
      workflow: z.enum(['overview', 'single', 'batch', 'inspect']).optional().describe('Guidance focus. Default: overview.'),
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
  'split_font',
  {
    title: 'Split a font into web-font chunks',
    description: 'Call this when the user wants to split one local TTF/OTF/TTC/OTC/WOFF/WOFF2 font into cn-font-split web font output files. All paths must stay inside the configured font workspace.',
    inputSchema: FontSplitOptions,
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
    description: 'Call this when the user wants to split many local font files under a directory. It scans and processes a bounded number of fonts, and can return per-font results, dry-run plans, or compact summary-only output depending on includeResults and dryRun.',
    inputSchema: {
      inputDir: z.string().optional().describe('Directory to scan, relative to the font workspace. Defaults to the workspace root.'),
      outputRoot: z.string().optional().describe('Directory to place per-font output folders. Defaults to split-output.'),
      limit: z.number().int().positive().max(50000).optional().describe('Maximum fonts to process after dedupe. Defaults to 20.'),
      maxFiles: z.number().int().positive().max(50000).optional().describe('Maximum files to scan. Defaults to 5000.'),
      includeResults: z.boolean().optional().describe('Include per-font result objects in the response. Default: true. Set false for large batch runs that only need summary counts and errors.'),
      dryRun: z.boolean().optional().describe('Preview scan, dedupe, naming, and skip decisions without writing output files. Default: false.'),
      ...Object.fromEntries(Object.entries(FontSplitOptions).filter(([key]) => !['fontPath', 'outDir'].includes(key))),
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
  'inspect_split_output',
  {
    title: 'Inspect split font output',
    description: 'Call this to summarize and structurally inspect generated cn-font-split output files in an output directory.',
    inputSchema: {
      outDir: z.string().optional().describe('Output directory to inspect, relative to the font workspace. Defaults to split-output.'),
      maxFiles: z.number().int().positive().max(200000).optional().describe('Maximum output files to inspect. Defaults to 200000.'),
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
