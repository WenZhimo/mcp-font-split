export const FONT_IDENTITY_RESPONSE_FIELD_CATALOG = {
  identityBasis: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Machine-readable basis used to build a font identity key, such as typographic-family-subfamily, opentype-family-subfamily, full-name, postscript-name, family-only, or a fallback basis.',
    agentAction: 'Look up this value in fontIdentityBasisCatalog before claiming semantic equivalence or explaining dedupe results.',
  },
};
