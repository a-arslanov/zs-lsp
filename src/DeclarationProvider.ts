import { Declaration, DeclarationParams } from "vscode-languageserver";
import { LSP } from "./LSP";
import url from "url";

export class ZSDeclarationProvider {
  private lsp: LSP;

  constructor(lsp: LSP) {
    this.lsp = lsp;
  }

  public provideDeclaration(params: DeclarationParams): Declaration {
    const node = this.lsp.contextManager.getNodeAtPosition(
      this.lsp.getCache(params.textDocument.uri).filePath,
      params.position.line,
      params.position.character
    );

    const declaration = this.lsp.contextManager.getDeclaration(
      node,
      this.lsp.getCache(params.textDocument.uri).filePath
    );

    if (!declaration?.declaration) {
      return null;
    }

    const result: Declaration = {
      uri: url.pathToFileURL(declaration.filePath).href,
      range: {
        start: {
          line: declaration.declaration.startPosition.row,
          character: declaration.declaration.startPosition.column,
        },
        end: {
          line: declaration.declaration.endPosition.row,
          character: declaration.declaration.endPosition.column,
        },
      },
    };
    return result;
  }
}
