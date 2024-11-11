import { Hover, HoverParams } from "vscode-languageserver";
import { LSP } from "./LSP";

export class ZSHoverProvider {
  private lsp: LSP;

  constructor(lsp: LSP) {
    this.lsp = lsp;
  }

  public provideHover(params: HoverParams): Hover {
    const filePath = this.lsp.getCache(params.textDocument.uri).filePath;

    const node = this.lsp.contextManager.getNodeAtPosition(
      filePath,
      params.position.line,
      params.position.character
    );

    console.log(`HoverProvider: request ${node.type}:${node.text}`);
    const declaration = this.lsp.contextManager.getDeclaration(node, filePath);

    if (!declaration.declaration) {
      console.warn(
        `HoverProvider: no declaration found for ${node.type}:${node.text}`
      );
      return null
    }
    console.info(
      `HoverProvider: found declaration - ${node.type}:${node.text} --> kind ${declaration.kind}`
    );

    if (
      declaration.kind === "interface_declaration") {
      const hover: Hover = {
        contents: [
          `\`\`\`javascript\n(interface) ${
            declaration.identifier.text
          }\n\`\`\``,
        ],
      };
      return hover
    }

    if (
      declaration.kind === "method_signature_declaration" ||
      declaration.kind === "function_declaration"
    ) {
      const params = this.lsp.contextManager
        .getParams(declaration.declaration)
        ?.map((p) => p.text)
        .join(", ");
      const hover: Hover = {
        contents: [
          `\`\`\`javascript\n(function) ${
            declaration.identifier.text
          }(${params}): ${
            this.lsp.contextManager.getDeclarationType(declaration.declaration)
              .text
          }\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "local_type_declaration") {
      const declarator = declaration.declaration
        .descendantsOfType("typed_variable_declarator")[0]
      const hover: Hover = {
        contents: [
          `\`\`\`zs\n(type) ${
            declarator.childForFieldName("value")?.text ?? declarator.text
          }\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "function_invocation") {
      const params = this.lsp.contextManager
        .getParams(declaration.declaration)
        ?.map((p) => p.text)
        .join(", ");
      const hover: Hover = {
        contents: [
          `\`\`\`javascript\n(function) ${
            declaration.identifier.text
          }(${params}): ${
            this.lsp.contextManager.getDeclarationType(declaration.declaration)
              .text
          }\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "field_declaration") {
      const classOrInterfaceName =
        declaration.identifier
          .closest(["class_declaration", "interface_declaration"])
          ?.childForFieldName("name")?.text ??
        declaration.declaration
          .closest(["class_declaration", "interface_declaration"])
          ?.childForFieldName("name")?.text;
      const inh = declaration.inheritedFrom
        ? declaration.inheritence
            .slice(
              0,
              declaration.inheritence.indexOf(declaration.inheritedFrom) + 1
            )
            .map((n) => this.lsp.contextManager.getDeclarationName(n.declaration).text)
            .join("\n")
        : "";
      const hover: Hover = {
        contents: [
          `\`\`\`javascript\n(property) ${classOrInterfaceName}.${
            declaration.declaration.childForFieldName("name")?.text
          }: ${
            this.lsp.contextManager.getDeclarationType(declaration.declaration)
              ?.text
          }${inh ? `\ninheritance path:\n${inh}` : ""}\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "local_variable_declaration") {
      const value = declaration.declaration
        .descendantsOfType("variable_declarator")[0]
        ?.childForFieldName("value");
      const hover: Hover = {
        contents: [
          `\`\`\`javascript\n(variable) ${declaration.identifier.text}: ${
            declaration.declaration.childForFieldName("type").text
          }${value && value.childCount < 2 ? ` = ${value.text}` : ""}\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "include") {
      const exports = this.lsp.contextManager.getExports(
        declaration.identifier.text,
        filePath,
      );
      const mapped = Object.entries(exports)
        .map(([key, value]) => {
          return `${key}: ${value.type}`;
        })
        .join("\n");

      const hover: Hover = {
        contents: [`\`\`\`javascript\n${mapped}\n\`\`\``],
      };
      return hover
    }

    if (declaration.kind === "new_expression") {
      const inheritance = this.lsp.contextManager.getInheritance(
        declaration,
        filePath
      );
      const hover: Hover = {
        contents: [
          `\`\`\`javascript\nclass ${declaration.identifier.text}\n${
            inheritance.length
              ? `inheritance:\n${inheritance
                  .map((n) => n.declaration.childForFieldName("name").text)
                  .join("\n")}`
              : ""
          }\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "method_invocation") {
      const params = this.lsp.contextManager
        .getParams(declaration.declaration)
        .map((p) => p.text)
        .join(", ");
      const type = this.lsp.contextManager.getDeclarationType(
        declaration.declaration
      );
      const hover: Hover = {
        contents: [
          `\`\`\`javascript\n(method) ${
            declaration.declaration
              .closest(["class_declaration", "interface_declaration"])
              .childForFieldName("name").text
          }.${
            declaration.declaration.childForFieldName("name").text
          }(${params}): ${type.text}\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "added_method_invocation") {
      const params = this.lsp.contextManager
        .getParams(declaration.declaration)
        .slice(1)
        .map((p) => p.text)
        .join(", ");
      const className = declaration.declaration
        .descendantsOfType("formal_parameters")[0]
        .descendantsOfType("formal_parameter")[0]
        .childForFieldName("type");
      const hover: Hover = {
        contents: [
          `\`\`\`javascript\n(method) ${className.text}.${
            node.text
          }(${params}): ${
            declaration.declaration.childForFieldName("type").text
          }\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "enumerator") {
      const enumDeclaration =
        declaration.declaration.closest("enum_declaration");
      const enumerators = enumDeclaration.descendantsOfType("enumerator");
      let lastIndex = 0;
      const enumContext = {};
      enumerators.forEach((c) => {
        if (c.children.length === 3) {
          lastIndex = Number(c.children[2].text);
          enumContext[c.children[0].text] = Number(c.children[2].text);
          return;
        }
        lastIndex += 1;
        enumContext[c.children[0].text] = lastIndex;
      });

      const hover: Hover = {
        contents: [
          `\`\`\`zs\n(enum member) ${
            enumDeclaration.childForFieldName("name").text
          }.${declaration.identifier.text} = ${
            enumContext[declaration.identifier.text]
          }\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "identifier") {
      if (declaration.declaration.parent.type === "formal_parameters") {
        const hover: Hover = {
          contents: [
            `\`\`\`zs\n(parameter) ${
              declaration.declaration.childForFieldName("name").text
            }: ${
              declaration.declaration.childForFieldName("type").text
            }\n\`\`\``,
          ],
        };
        return hover
      }

      if (declaration.declaration.type === "enum_declaration") {
        const hover: Hover = {
          contents: [
            `\`\`\`zs\n(enum) ${
              declaration.declaration.childForFieldName("name").text
            }\n\`\`\``,
          ],
        };
        return hover
      }

      const membership = this.lsp.contextManager.getMembership(
        declaration.identifier
      );
      const type = this.lsp.contextManager.getDeclarationType(
        declaration.declaration
      );

      let memberOf = "";
      let className = "";
      let params = "";
      if (membership?.length) {
        const classDeclaration = membership.find(
          (m) => m.type === "class_declaration"
        );
        if (membership[0].type === "field_declaration") {
          memberOf = "(property)";
        }
        if (membership[0].type === "method_declaration") {
          params = this.lsp.contextManager
            .getParams(declaration.declaration)
            ?.map((p) => p.text)
            .join(", ");
          memberOf = "(method)";
        }
        if (classDeclaration) {
          className = classDeclaration.childForFieldName("name").text;
        }
      }

      const hover: Hover = {
        contents: [
          `\`\`\`zs\n${memberOf ? `${memberOf} ` : ""}${
            className && className !== declaration.identifier.text
              ? `${className}.`
              : ""
          }${declaration.identifier.text}${params ? `(${params})` : ""}${
            type ? `: ${type.text}` : ""
          }\n\`\`\``,
        ],
      };
      return hover
    }

    if (declaration.kind === "type_identifier") {
      if (declaration.declaration.type === "local_type_declaration") {
        const declarator = declaration.declaration
        .descendantsOfType("typed_variable_declarator")[0]
        const hover: Hover = {
          contents: [
            `\`\`\`zs\n${
              declarator.childForFieldName("value")?.text ?? declarator.text
            }\n\`\`\``,
          ],
        };
        return hover
      }
      const hover: Hover = {
        contents: [
          `\`\`\`zs\n${declaration.declaration.type.split("_")[0]} ${
            declaration.identifier.text
          }\n\`\`\``,
        ],
      };
      return hover
    }

    return null
  }
}
