import { buildToolOptionCatalog } from './tool-option-catalog.js';
import { WORKFLOW_PRESET_NAMES } from './workflow-preset-catalog.js';

export const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);

export const FORMAT_PRIORITY = { '.otf': 0, '.ttf': 1, '.woff2': 2, '.ttc': 3, '.otc': 4, '.woff': 5 };

export const FORMAT_PRIORITY_ORDER = Object.entries(FORMAT_PRIORITY)
  .sort((a, b) => a[1] - b[1])
  .map(([extension]) => extension);

export const SKIP_MODES = ['manifest', 'force'];
export const BATCH_GROUP_BY_MODES = ['auto', 'source-dir', 'font-family'];
export const BATCH_NAMING_MODES = ['plain', 'numeric-suffix', 'source-suffix'];
export const BATCH_DEDUPE_MODES = ['none', 'same-path', 'font-identity'];
export const BATCH_ERROR_MODES = ['collect', 'fail-fast', 'fail-after'];
export const OVERSIZED_KERN_ACTIONS = ['preserve', 'strip'];
export const SMALL_GLYPH_ACTIONS = ['subset', 'single-woff2', 'copy-original'];
export const SPLIT_FAILURE_ACTIONS = ['error', 'single-woff2'];

export { FONT_IDENTITY_BASIS_CATALOG } from './font-identity-basis-catalog.js';

export { OUTPUT_STRUCTURE_CATALOG } from './output-structure-catalog.js';

export {
  ALL_TOOL_NAMES,
  TOOL_RESPONSE_FIELD_CATALOG,
} from './tool-response-field-catalog.js';

export {
  WORKFLOW_PRESETS,
  WORKFLOW_PRESET_NAMES,
} from './workflow-preset-catalog.js';

export {
  GUIDANCE_COMPACT_SECTION_NAMES,
  GUIDANCE_DETAIL_LEVELS,
  GUIDANCE_SECTION_FIELDS,
  GUIDANCE_SECTION_NAMES,
  GUIDANCE_WORKFLOWS,
} from './guidance-section-catalog.js';

export const TOOL_OPTION_CATALOG = buildToolOptionCatalog({
  WORKFLOW_PRESET_NAMES,
  SKIP_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
  OVERSIZED_KERN_ACTIONS,
});

export {
  ERROR_RESPONSE_CATALOG,
  WARNING_CODE_CATALOG,
} from './diagnostic-catalogs.js';

export {
  DIRECTORY_HANDLING_MODE_BY_ORGANIZATION_ROUTE,
  DIRECTORY_HANDLING_MODE_CATALOG_ENTRIES,
  DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
  DIRECTORY_HANDLING_SHORT_ANSWER_BY_MODE,
  buildDirectoryHandlingModeCatalog,
} from './directory-handling-catalog.js';

export {
  UNSUPPORTED_FILE_CATEGORY_DETAILS,
  UNSUPPORTED_FILE_EXTENSION_CATEGORIES,
} from './unsupported-file-catalog.js';
