import Parser, { SyntaxNode } from "tree-sitter";
import ZSLanguage from "tree-sitter-zs";
import { LSP } from "./LSP";

export type SemanticToken = [number, number, number, number, number];

export interface DeclarationNode {
  declaration: SyntaxNode;
  identifier: SyntaxNode;
  filePath: string;
  ctx: SyntaxNode[][];
  ctxBlock: SyntaxNode[];
  kind: string;
  inheritence?: DeclarationNode[];
  inheritedFrom?: DeclarationNode;
}

export class ContextManager {
  private parser: Parser;
  private lsp: LSP;

  constructor(lsp: LSP) {
    this.lsp = lsp;
    this.parser = new Parser();
    this.parser.setLanguage(ZSLanguage);
  }

  /**
   * Get node at position
   * @param filePathOrContent string
   * @param row number
   * @param column number
   * @returns SyntaxNode
   */
  public getNodeAtPosition(
    filePathOrContent: string,
    row: number,
    column: number
  ) {
    const isFilePath = filePathOrContent.endsWith(".zs");
    const node = isFilePath
      ? this.lsp.getCache(filePathOrContent).node
      : this.parser.parse(this.preprocess(filePathOrContent)).rootNode;

    return node.descendantForPosition({ row, column });
  }

  /**
   * Get context path for node
   * @param node SyntaxNode
   * @returns SyntaxNode[]
   */
  public getContextPath(node: SyntaxNode) {
    const path: SyntaxNode[] = [];
    this.forEachParent(node, (parent) => {
      if (this.isContextNode(parent)) {
        path.push(parent);
      }
      if (parent.parent?.type === "method_declaration") {
        path.push(parent.parent.descendantsOfType("formal_parameters")[0]);
      }
      if (parent.parent?.type === "for_statement") {
        path.push({
          type: "block",
          namedChildren: parent.parent.childrenForFieldName("init"),
        } as SyntaxNode);
      }
      if (parent.parent?.type === "function_declaration") {
        path.push(parent.parent.descendantsOfType("formal_parameters")[0]);
      }
      if (parent.parent?.type === "method_signature_declaration") {
        path.push(parent.parent.descendantsOfType("formal_parameters")[0]);
      }
    });

    return path;
  }

  /**
   * Get context for node as array of declaration nodes from node to root
   * @param node SyntaxNode
   * @returns SyntaxNode[][]
   */
  public getContext(node: SyntaxNode) {
    const path = this.getContextPath(node);
    return path
      .map((node) => {
        return node.namedChildren.filter(this.isDeclaration);
      })
      .filter((n) => n.length);
  }

  /**
   * Get declaration for identifier node
   * @param node SyntaxNode
   * @param filePath string
   * @returns DeclarationNode
   */
  public getDeclarationForIdentifier(
    node: SyntaxNode,
    filePath: string
  ): DeclarationNode {
    const ctx = this.getContext(node);
    let result: DeclarationNode = {
      declaration: null,
      identifier: null,
      filePath,
      ctx: [],
      ctxBlock: [],
      kind: null,
    };
    for (const path of ctx) {
      // path.map((n) => n.text); // ?
      for (const nodeToCheck of path) {
        const varName = this.getDeclarationIdentifier(nodeToCheck);
        for (const n of varName) {
          // n?.text; // ?
          // node?.text; // ?
          if (n?.text === node?.text) {
            result.declaration = nodeToCheck;
            result.identifier = n;
            result.filePath = filePath;
            result.ctx = ctx;
            result.ctxBlock = path;
            kind: "identifier";
            break;
          }
        }
      }
    }

    if (!result.declaration) {
      this.lsp.forEachImport(filePath, (importPath) => {
        const exports = this.getExports(importPath, filePath);
        if (exports[node.text]) {
          result.declaration = exports[node.text];
          result.identifier = node;
          result.filePath = importPath;
          result.ctx = [Object.values(exports)];
          return result;
        }
      });
    }

    return result;
  }

  /**
   * Get declaration for node
   * @param node SyntaxNode
   * @param filePath string
   * @returns DeclarationNode
   */
  public getDeclaration(node: SyntaxNode, filePath: string): DeclarationNode {
    if (node.closest(["preproc_def", "preproc_undef"])) {
      return null;
    }

    const result: DeclarationNode = {
      declaration: null,
      identifier: null,
      kind: null,
      ctx: [],
      ctxBlock: [],
      filePath,
    };

    switch (node.type) {
      case "identifier": {
        if (node.parent?.type === "new_expression") {
          const r = this.getDeclarationForIdentifier(node, filePath);
          result.declaration = r.declaration;
          result.identifier = node;
          result.kind = "new_expression";
          result.ctx = r.ctx;
          result.ctxBlock = r.ctxBlock;
          result.filePath = r.filePath;
          break;
        }
        if (
          node.parent?.type === "field_access" &&
          node.parent.childForFieldName("object") !== node
        ) {
          const parentDeclaration = this.getDeclaration(
            node.parent.childForFieldName("object"),
            filePath
          );
          if (!parentDeclaration.declaration) {
            console.warn(
              `ContextManager.getDeclaration: no declaration found for "${
                node.parent.childForFieldName("object").text
              }"`
            );
            break;
          }

          if (parentDeclaration.declaration.type === "field_declaration") {
            const type = this.getDeclarationType(parentDeclaration.declaration);
            const impl = this.getDeclarationForIdentifier(type, filePath);
            const inheritance = this.getInheritance(impl, filePath, [impl]);
            let property: SyntaxNode;
            let inheritedFrom: DeclarationNode;
            for (const inh of inheritance) {
              property =
                property ??
                inh.declaration
                  .descendantsOfType([
                    "field_declaration",
                    "get_declaration",
                    "set_declaration",
                  ])
                  .find((n) => {
                    return n.childForFieldName("name").text === node.text;
                  });
              if (property) {
                inheritedFrom = inh;
              }
            }

            if (!property) {
              console.warn(
                `ContextManager.getDeclaration: no property found for "${node.text}"`
              );
              break;
            }

            result.declaration = property;
            result.identifier = node;
            result.kind = "field_declaration";
            result.ctx = parentDeclaration.ctx;
            result.ctxBlock = parentDeclaration.ctxBlock;
            result.inheritence = inheritance;
            result.inheritedFrom = inheritedFrom;
            result.filePath = inheritedFrom.filePath;
            break;
          }
          if (parentDeclaration.declaration.type === "enum_declaration") {
            const r = this.getDeclaration(
              parentDeclaration.declaration
                .descendantsOfType("enumerator")
                .find((n) => n.childForFieldName("name").text === node.text)
                .firstChild,
              filePath
            );
            result.declaration = r.declaration;
            result.identifier = node;
            result.kind = "enumerator";
            result.ctx = parentDeclaration.ctx;
            result.ctxBlock = parentDeclaration.ctxBlock;
            result.filePath = parentDeclaration.filePath;
            break;
          }
          if (
            parentDeclaration.declaration.type === "local_variable_declaration"
          ) {
            const r = this.getDeclarationType(parentDeclaration.declaration);
            const impl = this.getDeclarationForIdentifier(r, filePath);

            const { property, inheritedFrom, inheritance } = this.getInherited(
              impl,
              node.text,
              filePath
            );
            result.declaration = property;
            result.identifier = node;
            result.kind = "field_declaration";
            result.ctx = parentDeclaration.ctx;
            result.ctxBlock = parentDeclaration.ctxBlock;
            result.inheritence = inheritance;
            result.inheritedFrom = inheritedFrom;
            result.filePath = inheritedFrom.filePath;
            break;
          }
        }

        if (
          node.parent?.type === "method_invocation" &&
          node.parent.childForFieldName("object") !== node
        ) {
          if (node.parent.childForFieldName("object")) {
            const parentDeclaration = this.getDeclaration(
              node.parent.childForFieldName("object"),
              filePath
            );
            if (!parentDeclaration.declaration) {
              console.warn(
                `ContextManager.getDeclaration: no declaration found for "${
                  node.parent.childForFieldName("object").text
                }"`
              );
              break;
            }
            const type = this.getDeclarationType(parentDeclaration.declaration);
            const typeImpl = this.getDeclarationForIdentifier(type, filePath);
            const generic =
              typeImpl.declaration.descendantsOfType("generic_type");
            let impl: DeclarationNode;
            if (generic.length) {
              console.log(
                `ContextManager.getDeclaration: resolved generic "${type.text}"`
              );
              const genericName = generic[0].firstChild;
              const genericImpl = this.getDeclarationForIdentifier(
                genericName,
                filePath
              );
              impl = genericImpl;
            } else {
              impl = this.getDeclarationForIdentifier(type, filePath);
            }

            console.log(
              `ContextManager.getDeclaration: resolved type "${type.text}"`
            );

            const method = impl.declaration
              .descendantsOfType(["method_declaration", "method_interface"])
              .find((n) => {
                return n.childForFieldName("name").text === node.text;
              });
            if (!method) {
              const r = this.getDeclarationForIdentifier(node, filePath);
              result.kind = "added_method_invocation";
              result.declaration = r.declaration;
              result.identifier = node;
              result.ctx = r.ctx;
              result.ctxBlock = r.ctxBlock;
              result.filePath = r.filePath;
              break;
            }
            result.declaration = method;
            result.identifier = node;
            result.kind = "method_invocation";
            result.ctx = impl.ctx;
            result.ctxBlock = impl.ctxBlock;
            result.filePath = impl.filePath;
            break;
          }
          if (node.parent.parent?.type === "new_expression") {
            const classDecl = this.getDeclarationForIdentifier(node.parent.parent.childForFieldName('name'), filePath);
            const method = this.getInherited(classDecl, node.text, filePath);
            
            result.declaration = method.property;
            result.identifier = node;
            result.kind = "method_invocation";
            result.ctx = method.inheritedFrom.ctx;
            result.ctxBlock = method.inheritedFrom.ctxBlock;
            result.filePath = method.inheritedFrom.filePath;
            break;
          }

          const method = this.getDeclarationForIdentifier(node, filePath);
          if (method.declaration.type === "method_signature_declaration") {
            result.declaration = method.declaration;
            result.identifier = node;
            result.kind = "function_invocation";
            result.ctx = method.ctx;
            result.ctxBlock = method.ctxBlock;
            result.filePath = method.filePath;
            break;
          }

          result.declaration = method.declaration;
          result.identifier = node;
          result.kind = "method_invocation";
          result.ctx = method.ctx;
          result.ctxBlock = method.ctxBlock;
          result.filePath = method.filePath;
          break;
        }

        const r = this.getDeclarationForIdentifier(node, filePath);

        if (r.declaration.type === "local_variable_declaration") {
          result.kind = "local_variable_declaration";
          result.declaration = r.declaration;
          result.identifier = r.identifier;
          result.ctx = r.ctx;
          result.ctxBlock = r.ctxBlock;
          result.filePath = r.filePath;
          break;
        }

        if (
          r.declaration.type === "method_signature_declaration" ||
          r.declaration.type === "function_declaration" ||
          r.declaration.type === "interface_declaration"
        ) {
          result.kind = r.declaration.type;
          result.declaration = r.declaration;
          result.identifier = r.identifier;
          result.ctx = r.ctx;
          result.ctxBlock = r.ctxBlock;
          result.filePath = r.filePath;
          break;
        }

        if (r.declaration.type === "local_type_declaration") {
          result.kind = "local_type_declaration";
          result.declaration = r.declaration;
          result.identifier = node;
          result.ctx = [];
          result.ctxBlock = [];
          result.filePath = r.filePath;
          break;
        }

        result.kind = "identifier";
        result.declaration = r.declaration;
        result.identifier = r.identifier;
        result.ctx = r.ctx;
        result.ctxBlock = r.ctxBlock;
        result.filePath = r.filePath;
        break;
      }

      case "type_identifier": {
        const r = this.getDeclarationForIdentifier(node, filePath);
        result.kind = "type_identifier";
        result.declaration = r.declaration;
        result.identifier = node;
        result.ctx = r.ctx;
        result.ctxBlock = r.ctxBlock;
        result.filePath = r.filePath;
        break;
      }
      case "string_fragment": {
        if (node.closest("preproc_include")) {
          result.kind = "include";
          result.declaration = node;
          result.identifier = node;
          result.ctx = [];
          result.ctxBlock = [];
          result.filePath = filePath;
          break;
        }
        console.warn(
          `ContextManager.getDeclaration: unknown string_fragment "${node?.type}"`
        );
        break;
      }
      default: {
        console.warn(
          `ContextManager.getDeclaration: unknown type "${node?.type}"`
        );
        break;
      }
    }
    return result;
  }

  /**
   * Get membership path for node
   * @param node SyntaxNode
   * @param path SyntaxNode[] start path for recursion
   * @returns SyntaxNode[]
   */
  public getMembership(
    node: SyntaxNode,
    path: SyntaxNode[] = []
  ): SyntaxNode[] {
    const memberOf = node.closest([
      "field_declaration",
      "class_declaration",
      "function_declaration",
      "method_declaration",
      "enum_declaration",
      "formal_parameters",
    ]);

    switch (memberOf?.type) {
      case "field_declaration": {
        path.push(memberOf);
        return this.getMembership(memberOf, path);
      }
      case "method_declaration": {
        path.push(memberOf);
        return this.getMembership(memberOf, path);
      }
      case "formal_parameters": {
        path.push(memberOf);
        return this.getMembership(memberOf, path);
      }
      default: {
        if (memberOf) {
          path.push(memberOf);
          return path;
        }
        return null;
      }
    }
  }

  /**
   * Get inheritance path for class/interface declaration node
   * @param node class/interface declaration node
   * @param filePath fs path to the file
   * @param path initial path
   * @returns array of DeclarationNode[] with inheritance path
   */
  public getInheritance(
    node: DeclarationNode,
    filePath: string,
    path: DeclarationNode[] = []
  ): DeclarationNode[] {
    switch (node.declaration.type) {
      case "class_declaration": {
        const extendsNode =
          node.declaration.childForFieldName("superclass")?.lastChild;
        if (extendsNode) {
          const extendsDeclaration = this.getDeclarationForIdentifier(
            extendsNode,
            filePath
          );
          path.push(extendsDeclaration);
          return this.getInheritance(extendsDeclaration, filePath, path);
        }
        const implementsNode =
          node.declaration.childForFieldName("interfaces")?.lastChild;
        if (implementsNode) {
          const implementsDeclaration = this.getDeclarationForIdentifier(
            implementsNode,
            filePath
          );
          path.push(implementsDeclaration);
          return this.getInheritance(implementsDeclaration, filePath, path);
        }
      }

      case "interface_declaration": {
        const parentInterface =
          node.declaration.childForFieldName("parent_interface");
        if (parentInterface) {
          const parentInterfaceDeclaration = this.getDeclarationForIdentifier(
            parentInterface,
            filePath
          );
          path.push(parentInterfaceDeclaration);
          return this.getInheritance(
            parentInterfaceDeclaration,
            filePath,
            path
          );
        }
      }

      default: {
        return path;
      }
    }
  }

  /**
   * Get inherited property for node
   * @param node DeclarationNode class/interface declaration node
   * @param member string property/method name
   * @param filePath string
   * @returns { property: SyntaxNode, inheritedFrom: SyntaxNode, inheritance: SyntaxNode[] }
   */
  public getInherited(
    node: DeclarationNode,
    member: string,
    filePath: string
  ): {
    property: SyntaxNode;
    inheritedFrom: DeclarationNode;
    inheritance: DeclarationNode[];
  } {
    const inheritance = this.getInheritance(node, filePath, [node]);
    let property: SyntaxNode;
    let inheritedFrom: DeclarationNode;
    for (const inh of inheritance) {
      property =
        property ??
        inh.declaration
          .descendantsOfType([
            "field_declaration",
            "get_declaration",
            "set_declaration",
            "method_declaration",
            "method_signature_declaration",
          ])
          .find((n) => {
            return this.getDeclarationIdentifier(n).some((i) => i.text === member);
          });
      if (property) {
        inheritedFrom = inh;
      }
    }

    if (!property) {
      return null;
    }
    return {
      property,
      inheritedFrom,
      inheritance: inheritance.slice(1),
    };
  }

  /**
   * Get type of node
   * @param node SyntaxNode
   * @returns SyntaxNode
   */
  public getDeclarationType(node: SyntaxNode): SyntaxNode {
    switch (node.type) {
      case "field_declaration": {
        return node.childForFieldName("type");
      }
      case "method_declaration": {
        return node.childForFieldName("type");
      }
      case "formal_parameter": {
        return node.childForFieldName("type");
      }
      case "local_variable_declaration": {
        return node.childForFieldName("type");
      }
      case "function_declaration": {
        return node.childForFieldName("type");
      }
      case "method_interface": {
        return node.childForFieldName("type");
      }
      case "class_declaration": {
        return node.childForFieldName("name");
      }
      case "get_declaration": {
        return node.childForFieldName("type");
      }
      case "set_declaration": {
        return node.childForFieldName("type");
      }
      case "method_signature_declaration": {
        return node.childForFieldName("type");
      }
      default: {
        console.warn(
          `ContextManager.getDeclarationType: unknown type "${node?.type}"`
        );
      }
    }
  }

  /**
   * Get name of declaration node
   * @param node SyntaxNode
   * @returns SyntaxNode
   */
  public getDeclarationName(node: SyntaxNode): SyntaxNode {
    switch (node.type) {
      case "class_declaration": {
        return node.childForFieldName("name");
      }
      case "interface_declaration": {
        return node.childForFieldName("name");
      }

      default: {
        console.warn(
          `ContextManager.getDeclarationName: unknown type "${node?.type}"`
        );
      }
    }
  }

  /**
   * Get parameters of method/function declaration node
   * @param node SyntaxNode
   * @returns SyntaxNode[]
   */
  public getParams(node: SyntaxNode): SyntaxNode[] {
    if (
      node.type !== "method_declaration" &&
      node.type !== "function_declaration" &&
      node.type !== "method_interface" &&
      node.type !== "method_signature_declaration"
    ) {
      console.warn(
        `ContextManager.getParams: not a node with params - "${node?.type}"`
      );
      return null;
    }
    return node
      .childForFieldName("parameters")
      .descendantsOfType("formal_parameter");
  }

  /**
   * Get return name node of node
   * @param node SyntaxNode
   * @returns SyntaxNode[]
   */
  public getDeclarationIdentifier(node: SyntaxNode): SyntaxNode[] {
    switch (node.type) {
      case "class_declaration": {
        return [node.childForFieldName("name")];
      }
      case "enum_declaration": {
        return [node.childForFieldName("name")];
      }
      case "enumerator": {
        return [node.childForFieldName("name")];
      }
      case "function_declaration": {
        return [node.childForFieldName("name")];
      }
      case "method_declaration": {
        return [node.childForFieldName("name")];
      }
      case "formal_parameter": {
        return [node.childForFieldName("name")];
      }
      case "interface_declaration": {
        return [node.childForFieldName("name")];
      }
      case "get_declaration": {
        return [node.childForFieldName("name")];
      }
      case "set_declaration": {
        return [node.childForFieldName("name")];
      }
      case "method_signature_declaration": {
        return [node.childForFieldName("name")];
      }
      case "method_interface": {
        return [node.childForFieldName("name")];
      }
      case "new_expression": {
        return [node.childForFieldName("name")];
      }
      case "field_declaration": {
        return node
          .descendantsOfType("variable_declarator")
          .map((c) => c.childForFieldName("name"));
      }
      case "local_variable_declaration": {
        return node
          .descendantsOfType("variable_declarator")
          .map((c) => c.childForFieldName("name"));
      }
      case "local_type_declaration": {
        return node
          .descendantsOfType("typed_variable_declarator")
          .map((c) => c.childForFieldName("name"));
      }
      default:
        console.warn(
          `ContextManager.getTypOfIdentifier: unknown type "${node?.type}"`
        );
    }
    return null;
  }

  public getMembers(node: SyntaxNode): SyntaxNode[] {
    return node
      .descendantsOfType([
        "field_declaration",
        "get_declaration",
        "method_declaration",
        "method_signature_declaration",
        "method_interface",
      ])
      .flatMap((m) => this.getDeclarationIdentifier(m));
  }

  /**
   * Check if node is context node
   * @param node SyntaxNode
   * @returns boolean
   */
  private isContextNode(node: SyntaxNode): boolean {
    if (
      node.type === "program" ||
      node.type === "block" ||
      node.type === "class_body" ||
      node.type === "enumerator_list"
    ) {
      return true;
    }
    return false;
  }

  /**
   * Check if node is declaration node
   * @param node SyntaxNode
   * @returns boolean
   */
  private isDeclaration(node: SyntaxNode): boolean {
    if (
      node.type === "class_declaration" ||
      node.type === "enum_declaration" ||
      node.type === "enumerator" ||
      node.type === "function_declaration" ||
      node.type === "field_declaration" ||
      node.type === "method_declaration" ||
      node.type === "interface_declaration" ||
      node.type === "local_variable_declaration" ||
      node.type === "local_type_declaration" ||
      node.type === "method_signature_declaration" ||
      node.type === "formal_parameter"
    ) {
      return true;
    }
    return false;
  }

  /**
   * Iterate through parent nodes, stop on thuthy return value
   * @param node SyntaxNode to start from
   * @param cb callback function
   * @returns T
   */
  private forEachParent<T>(node: SyntaxNode, cb: (node: SyntaxNode) => T): T {
    let parent = node?.parent;
    while (parent) {
      const exit = cb(parent);
      if (exit) {
        return exit as T;
      }
      parent = parent.parent;
    }
  }

  /**
   * Preprocess content to remove dangerous preprocessor directives
   * @param content string
   * @returns string
   */
  public preprocess(content: string): string {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("#if") || line.startsWith("#endif")) {
        lines[i] = "//" + line;
        continue;
      }
      if (line.startsWith("#else")) {
        lines[i] = "//" + line;
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j].startsWith("//#if")) {
            break;
          }
          lines[j] = "//" + lines[j];
        }
        continue;
      }
      lines[i] = line;
    }

    return lines.join("\n");
  }

  /**
   * Get exports from file content
   * @param filePathOrContent string
   * @param callerFilePath string
   * @returns Record<string, SyntaxNode>
   */
  getExports(
    filePathOrContent: string,
    callerFilePath?: string
  ): Record<string, SyntaxNode> {
    const isFilePath =
      filePathOrContent.endsWith(".zs") || filePathOrContent.endsWith(".zi");
    const node = isFilePath
      ? this.lsp.getCache(this.lsp.resolvePath(callerFilePath, filePathOrContent)).node
      : this.parser.parse(this.preprocess(filePathOrContent)).rootNode;

    return node
      .descendantsOfType([
        "class_declaration",
        "function_declaration",
        "enum_declaration",
        "interface_declaration",
        "local_variable_declaration",
        "local_type_declaration",
        "method_signature_declaration",
      ])
      .reduce((acc, cur) => {
        if (
          cur.closest([
            "class_declaration",
            "function_declaration",
            "enum_declaration",
          ])
        ) {
          return acc;
        }
        let name: string;
        try {
          if (cur.type === "class_declaration") {
            name = cur.childForFieldName("name").text;
          }
          if (cur.type === "function_declaration") {
            name = cur.childForFieldName("name").text;
          }
          if (cur.type === "enum_declaration") {
            name = cur.childForFieldName("name").text;
          }
          if (cur.type === "interface_declaration") {
            name = cur.childForFieldName("name").text;
          }
          if (cur.type === "method_signature_declaration") {
            name = cur.childForFieldName("name").text;
          }
          if (cur.type === "local_variable_declaration") {
            name = cur
              .childForFieldName("declarator")
              .childForFieldName("name").text;
          }
          if (cur.type === "local_type_declaration") {
            name = cur.children[1].children[0].children[0].text;
          }
        } catch {
          // parsing error (preprocess)
        }
        acc[name] = cur;
        return acc;
      }, {} as Record<string, SyntaxNode>);
  }
}
