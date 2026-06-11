#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { inspectSplitOutput, splitFont, splitFontBatch } from './font-split.js';

const FontSplitOptions = {
  fontPath: z.string().describe('Font file path relative to the font workspace, or an absolute path inside it.'),
  outDir: z.string().optional().describe('Output directory relative to the font workspace. Defaults to split-output/<font-file-name>.'),
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
  smallGlyphThreshold: z.number().int().positive().optional().describe('Glyph-count threshold used when smallGlyphAction is single-woff2. Default: 50.'),
  splitFailureAction: z.enum(['error', 'single-woff2']).optional().describe('What to do if cn-font-split fails. Default: error. Use single-woff2 to explicitly allow a one-file fallback after split failure.'),
  skipMode: z.enum(['legacy-css', 'manifest', 'force']).optional().describe('Batch incremental mode. legacy-css preserves the old result.css existence check, manifest compares source and effective options, and force always reprocesses.'),
  batchGroupBy: z.enum(['auto', 'source-dir', 'font-family']).optional().describe('Batch family grouping mode. auto preserves current behavior, source-dir groups by the source folder, and font-family groups by font metadata.'),
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
    description: 'Call this when the user wants to split many local font files under a directory. It processes a bounded number of fonts and returns one result per font.',
    inputSchema: {
      inputDir: z.string().optional().describe('Directory to scan, relative to the font workspace. Defaults to the workspace root.'),
      outputRoot: z.string().optional().describe('Directory to place per-font output folders. Defaults to split-output.'),
      limit: z.number().int().positive().max(500).optional().describe('Maximum fonts to process. Defaults to 20.'),
      maxFiles: z.number().int().positive().max(50000).optional().describe('Maximum files to scan. Defaults to 5000.'),
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
  'inspect_split_output',
  {
    title: 'Inspect split font output',
    description: 'Call this to summarize and structurally inspect generated cn-font-split output files in an output directory.',
    inputSchema: {
      outDir: z.string().optional().describe('Output directory to inspect, relative to the font workspace. Defaults to split-output.'),
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
