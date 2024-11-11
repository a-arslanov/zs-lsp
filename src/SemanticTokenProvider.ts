import { LSP } from "./LSP";

const q = `
[
  (line_comment)
  (block_comment)
] @comment

[
  (hex_integer_literal)
  (decimal_integer_literal)
  (octal_integer_literal)
  (decimal_floating_point_literal)
  (hex_floating_point_literal)
  (binary_integer_literal)
] @number

[
  (character_literal)
  (string_literal)
] @string
(escape_sequence) @string

[
  "break"
  "case"
  "class"
  "continue"
  "default"
  "do"
  "else"
  "extends"
  "for"
  "if"
  "return"
  "switch"
  "while"
  "implements"
  "extends"
] @keyword

[
  "#define"
  "#elif"
  "#else"
  "#endif"
  "#if"
  "#ifdef"
  "#ifndef"
  "#include"
] @macro

[
  (void_type)
  (integral_type)
  (floating_point_type)
  (fix_type)
  (str_type)
  (boolean_type)
] @type

(type_identifier) @type

(variable_declarator
  name: (identifier) @variable)

(interface_declaration
  name: (identifier) @class)

(class_declaration
  name: (identifier) @class)

(enum_declaration
  name: (identifier) @enum)

(new_expression
  name: (identifier) @class)

(method_invocation
  name: (identifier) @function)`

export class ZSSemanticTokenProvider {
  private lsp: LSP;
  static tokenTypesLegend = [
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

  static tokenModifiersLegend = [
    "declaration",
    "documentation",
    "readonly",
    "static",
    "abstract",
    "deprecated",
    "modification",
    "async",
  ];

  static tokenTypes = new Map<string, number>();

  static tokenModifiers = new Map<string, number>();

  static legend: { tokenTypes: Map<string, number>; tokenModifiers: string[] };

  constructor(lsp: LSP) {
    this.lsp = lsp;
    ZSSemanticTokenProvider.tokenTypesLegend.forEach((tokenType, index) =>
      ZSSemanticTokenProvider.tokenTypes.set(tokenType, index)
    );

    ZSSemanticTokenProvider.tokenModifiersLegend.forEach((tokenModifier, index) =>
      ZSSemanticTokenProvider.tokenModifiers.set(tokenModifier, index)
    );

    ZSSemanticTokenProvider.legend = {
      tokenTypes: ZSSemanticTokenProvider.tokenTypes,
      tokenModifiers: ZSSemanticTokenProvider.tokenModifiersLegend
  }
  }

  async provideDocumentSemanticTokens(
    // document: TextDocument,
    // token: CancellationToken
  ): Promise<any> {
    return [];
    // const builder = new this.lsp.vscode.SemanticTokensBuilder();
    // const tree = this.lsp.parse(document.getText());
    // const h = this.lsp.query(q, tree.rootNode)

    // h.forEach((token) => {
    //   const type = token.name;

    //   builder.push(
    //     token.node.startPosition.row,
    //     token.node.startPosition.column,
    //     token.node.endPosition.column - token.node.startPosition.column,
    //     ZSSemanticTokenProvider.tokenTypes.get(type),
    //     0
    //   );
    // })
    // return builder.build();
  }
}
