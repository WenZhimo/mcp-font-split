import { buildToolOptionCatalog } from './tool-option-catalog.js';
import {
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  OVERSIZED_KERN_ACTIONS,
  SKIP_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
} from './tool-option-enum-catalog.js';
import { WORKFLOW_PRESET_NAMES } from './workflow-preset-catalog.js';

export {
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  OVERSIZED_KERN_ACTIONS,
  SKIP_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
} from './tool-option-enum-catalog.js';

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

export {
  FONT_EXTENSIONS,
  FORMAT_PRIORITY,
  FORMAT_PRIORITY_ORDER,
} from './font-format-catalog.js';

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
