import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { LSP } from "./LSP";

export class ZSCompletitionProvider {
  private lsp: LSP;

  constructor(lsp: LSP) {
    this.lsp = lsp;
  }

  private deleteCharAt(str: string, line: number, character: number): string {
    const lines = str.split("\n");
    lines[line] =
      lines[line].slice(0, character) + lines[line].slice(character + 1);
    return lines.join("\n");
  }

  private getCharAt(str: string, line: number, character: number): string {
    return str.split("\n")[line].charAt(character);
  }

  public provideCompletionItems(
    documentPosition: TextDocumentPositionParams
  ): CompletionItem[] {
    const docNode = this.lsp.getCache(documentPosition.textDocument.uri);
    const lastCharacter = this.getCharAt(
      docNode.text,
      documentPosition.position.line,
      documentPosition.position.character - 1
    );
    if (lastCharacter !== ".") {
      return [];
    }

    const node = this.lsp.contextManager.getNodeAtPosition(
      this.deleteCharAt(
        docNode.text,
        documentPosition.position.line,
        documentPosition.position.character - 1
      ),
      documentPosition.position.line,
      documentPosition.position.character - 2
    );

    const declaration = this.lsp.contextManager.getDeclaration(
      node,
      docNode.filePath,
    );
    if (declaration.declaration.type === "field_declaration") {
      const type = this.lsp.contextManager.getDeclarationType(
        declaration.declaration
      );
      const decl = this.lsp.contextManager.getDeclaration(
        type,
        docNode.filePath
      );

      return this.lsp.contextManager.getMembers(decl.declaration).map((m) => {
        const item: CompletionItem = {
          label: m.text,
          kind: [
            "method_declaration",
            "method_signature_declaration",
            "method_interface",
          ].includes(m.parent.type)
            ? CompletionItemKind.Method
            : CompletionItemKind.Field,
          detail: "detail",
          documentation: "documentation",
          sortText: m.type + m.text,
        };
        return item;
      });
    }

    return [];
  }
}
