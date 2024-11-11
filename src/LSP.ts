import Parser, { Query, SyntaxNode } from "tree-sitter";
import ZSLanguage from "tree-sitter-zs";
import fs from "fs";
import { ZSHoverProvider } from "./HoverProvider";
import { ZSDeclarationProvider } from "./DeclarationProvider";
import { ContextManager } from "./ContextManager";
import path from "path";
import { ZSSemanticTokenProvider } from "./SemanticTokenProvider";
import { ZSDiagnosticProvider } from "./DiagnosticProvider";
import { ZSCompletitionProvider } from "./CompletitionProvider";

export class LSP {
  private projectRoot: string;
  private swfRoot: string;
  private parser: Parser;
  public cache: Map<
    string,
    { filePath: string; text: string; node: SyntaxNode }
  > = new Map();
  public contextManager: ContextManager;
  public declarationProvider: ZSDeclarationProvider;
  public hoverProvider: ZSHoverProvider
  public diagnosticProvider: ZSDiagnosticProvider;

  constructor(projectRoot: string, swfRoot: string) {
    this.projectRoot = projectRoot;
    this.swfRoot = swfRoot;
    this.contextManager = new ContextManager(this);
    this.declarationProvider = new ZSDeclarationProvider(this);
    this.hoverProvider = new ZSHoverProvider(this);
    this.diagnosticProvider = new ZSDiagnosticProvider(this);
  }
  public async init() {
    this.parser = new Parser();
    this.parser.setLanguage(ZSLanguage);
  }

  public parse(sourceCode: string) {
    return this.parser.parse(sourceCode);
  }

  public query(scm: string, node: SyntaxNode) {
    return (
      new Query(ZSLanguage, scm).matches(node)?.map((y) => y.captures[0]) ?? []
    );
  }

  public initSemanticTokenProvider() {
    const semanticTokenProvider = new ZSSemanticTokenProvider(this);
    return semanticTokenProvider.provideDocumentSemanticTokens.bind(
      semanticTokenProvider
    );
  }

  public initCompletitionProvider() {
    const completitionProvider = new ZSCompletitionProvider(this);
    return completitionProvider.provideCompletionItems.bind(completitionProvider);
  }

  public setCache(uri: string, content: string) {
    const filePath = uri.replace("file://", "");
    this.cache.set(uri.replace("file://", ""), {
      text: content,
      node: this.parse(this.contextManager.preprocess(content)).rootNode,
      filePath,
    });
  }

  public getCache(uri: string) {
    const filePath = uri.replace("file://", "");
    if (!this.cache.has(filePath)) {
      const file = fs.readFileSync(filePath, "utf-8");
      this.setCache(uri, file);
    }
    return this.cache.get(filePath);
  }

  public forEachImport<T>(
    entryFile: string,
    cb: (filePath: string) => unknown
  ): T {
    const stack = [entryFile, this.swfRoot + "/system.zi"];
    const visited = new Set();

    while (stack.length > 0) {
      const filePath = stack.pop();
      if (visited.has(filePath)) {
        continue;
      }
      visited.add(filePath);

      if (!filePath) {
        return null;
      }

      const exit = cb(filePath);
      if (exit) {
        return exit as T;
      }

      const imports = this.getImports(filePath);

      for (const importPath of imports) {
        try {
          if (!visited.has(importPath)) {
            stack.push(importPath);
          }
        } catch (error) {
          return null;
        }
      }
    }
  }

  public getImports(entryFile: string) {
    const fileContent = fs.readFileSync(entryFile, "utf-8");
    return [...fileContent.matchAll(/#include\s*(?:<|")(.*?)(?:>|")/g)]
      .map((match) => this.resolvePath(entryFile, match[1]))
      .filter(Boolean) as string[];
  }

  public resolvePath(callerPath: string, importName: string) {
    const name = path.basename(importName);
    const dir = path.dirname(callerPath);
    const namePrefix = importName.replace(name, "");
    if (importName.includes("/data/start/")) {
      return;
    }

    let p = path.resolve(dir, namePrefix, name);
    if (fs.existsSync(p)) {
      return p;
    }
    // try rootDir
    p = path.resolve(this.projectRoot, importName);
    if (fs.existsSync(p)) {
      return p;
    }

    // try swfRootDir
    p = path.resolve(this.swfRoot, importName);
    if (fs.existsSync(p)) {
      return p;
    }

    console.warn(
      `File not found: \nrootDir:${this.projectRoot}\ncallerPath:${callerPath} \nimportName:${importName} \nresolvedPath:${p}`
    );
  }
}
