export const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);

export const UNSUPPORTED_FILE_EXTENSION_CATEGORIES = {
  archive: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.br']),
  document: new Set(['.txt', '.md', '.markdown', '.pdf', '.doc', '.docx', '.rtf', '.odt', '.ofl', '.license']),
  image: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tif', '.tiff', '.avif']),
  web: new Set(['.html', '.htm', '.css', '.js', '.mjs', '.cjs']),
  metadata: new Set(['.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.url', '.csv', '.tsv']),
  signature: new Set(['.asc', '.sig']),
  'unsupported-font': new Set(['.eot', '.svg', '.dfont', '.suit', '.fon', '.bdf', '.pcf', '.pfa', '.pfb', '.pfm', '.afm', '.cff', '.cid', '.ttx', '.ufo', '.glyphs']),
};

export const UNSUPPORTED_FILE_CATEGORY_DETAILS = {
  archive: {
    meaning: 'Compressed archives that may contain fonts but are outside this tool layer.',
    handling: 'Reported in summaries only; never extracted, copied, or split.',
  },
  document: {
    meaning: 'Licenses, readme files, and other human-readable package documents.',
    handling: 'Reported and ignored; not copied by directory organization.',
  },
  image: {
    meaning: 'Preview images, screenshots, icons, or other raster assets shipped beside fonts.',
    handling: 'Reported and ignored; not copied by directory organization.',
  },
  web: {
    meaning: 'Web or generated frontend assets such as HTML, CSS, and JavaScript.',
    handling: 'Reported and ignored as source noise; generated split output is audited separately by inspect_split_output.',
  },
  metadata: {
    meaning: 'Package metadata, manifests, config files, links, and tabular sidecar files.',
    handling: 'Reported and ignored unless produced later as tool manifests in an output tree.',
  },
  signature: {
    meaning: 'Detached signature or checksum-adjacent files shipped with downloads.',
    handling: 'Reported and ignored; cryptographic verification is outside this tool.',
  },
  'unsupported-font': {
    meaning: 'Font-adjacent formats that are not supported input formats for this tool.',
    handling: 'Reported and ignored; only .ttf, .otf, .ttc, .otc, .woff, and .woff2 are supported inputs.',
  },
  extensionless: {
    meaning: 'Files with no extension.',
    handling: 'Reported with extension <none> and ignored unless they are renamed to a supported font extension and parse successfully.',
    extensions: ['<none>'],
  },
  other: {
    meaning: 'Unsupported files that do not match a known coarse category.',
    handling: 'Reported and ignored; inspect byExtension and examples before assuming intent.',
    extensions: [],
  },
};

export const FORMAT_PRIORITY = { '.otf': 0, '.ttf': 1, '.woff2': 2, '.ttc': 3, '.otc': 4, '.woff': 5 };

export const FORMAT_PRIORITY_ORDER = Object.entries(FORMAT_PRIORITY)
  .sort((a, b) => a[1] - b[1])
  .map(([extension]) => extension);
