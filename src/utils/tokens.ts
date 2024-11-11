export const tokenTypes = new Map<string, number>();
export const tokenModifiers = new Map<string, number>();

const tokenTypesLegend = [
  "comment",
  "string",
  "keyword",
  "number",
  "regexp",
  "operator",
  "namespace",
  "type",
  "struct",
  "class",
  "interface",
  "enum",
  "typeParameter",
  "function",
  "method",
  "decorator",
  "macro",
  "variable",
  "parameter",
  "property",
  "label",
];
tokenTypesLegend.forEach((tokenType, index) =>
  tokenTypes.set(tokenType, index)
);
const tokenModifiersLegend = [
    "declaration",
    "documentation",
    "readonly",
    "static",
    "abstract",
    "deprecated",
    "modification",
    "async",
  ];
  tokenModifiersLegend.forEach((tokenModifier, index) =>
    tokenModifiers.set(tokenModifier, index)
  );