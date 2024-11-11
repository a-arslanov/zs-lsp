import { LSP } from "./LSP";
import { SyntaxNode } from "tree-sitter";
import { diagnosticCodes } from "./utils/diagnosticsCodes";
import {
  DiagnosticSeverity,
  DocumentDiagnosticParams,
  DocumentDiagnosticReport,
} from "vscode-languageserver";

export class ZSDiagnosticProvider {
  private lsp: LSP;

  constructor(lsp: LSP) {
    this.lsp = lsp;
  }

  public updateDiagnostics(
    params: DocumentDiagnosticParams
  ): DocumentDiagnosticReport {
    const node = this.lsp.getCache(params.textDocument.uri).node;

    const errorNodes: SyntaxNode[] = [];
    const traverse = (node: SyntaxNode) => {
      if (node.isError) {
        errorNodes.push(node);
      }
      if (node.isMissing) {
        errorNodes.push(node);
      }
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(node);

    const result: DocumentDiagnosticReport = {
      kind: "full",
      items: errorNodes.map((node) => ({
        code: diagnosticCodes.SYNTAX_ERROR.code,
        message: diagnosticCodes.SYNTAX_ERROR.message,
        range: {
          start: {
            line: node.startPosition.row,
            character: node.startPosition.column,
          },
          end: {
            line: node.endPosition.row,
            character: node.endPosition.column,
          },
        },
        severity: DiagnosticSeverity.Error,
        source: "ZS",
        relatedInformation: [
          {
            location: {
              uri: params.textDocument.uri,
              range: {
                start: {
                  line: node.startPosition.row,
                  character: node.startPosition.column,
                },
                end: {
                  line: node.endPosition.row,
                  character: node.endPosition.column,
                },
              },
            },
            message: diagnosticCodes.SYNTAX_ERROR.message,
          },
        ],
      })),
    };

    return result;
  }
}
