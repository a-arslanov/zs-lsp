import assert from "node:assert";
import { describe, it, mock } from "node:test";
import Parser, { Query } from "tree-sitter";
import ZSLanguage from "tree-sitter-zs";
import { ContextManager } from "./ContextManager";
import fs from "fs";
import { LSP } from "./LSP";

const lsp = new LSP("", "");

const parser = new Parser();
parser.setLanguage(ZSLanguage);

describe("ContextManager", () => {
  it("getExports", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
int x = 1;
void foo() {}
type ConsoleMessageArray = Array<ConsoleMessage>;
class X {
  ptr Y y;
  public void foo() {
    int z = 1;
  }
}
enum E {}
`;
    const result = cm.getExports(input);
    const expected = ["x", "foo", "ConsoleMessageArray", "X", "E"];
    assert.deepEqual(Object.keys(result), expected);
  });

  it("getContextPath 1", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  public void foo() {
    int z = 1;
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 3, column: 8 });

    const result = cm.getContextPath(node);

    assert.deepEqual(
      result.map((x) => x.type),
      ["block", "formal_parameters", "class_body", "program"]
    );
  });

  it("getContextPath 2", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
enum E {
    A,
    B,
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 2, column: 4 });

    const result = cm.getContextPath(node);

    assert.deepEqual(
      result.map((x) => x.type),
      ["enumerator_list", "program"]
    );
  });

  it("getContextPath 3", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
if (true) {
  int xxxx = 1;
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 2, column: 9 });

    const result = cm.getContextPath(node);

    assert.deepEqual(
      result.map((x) => x.type),
      ["block", "program"]
    );
  });

  it("getContextPath 4", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
void x() {
  int xxxx = 1;
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 2, column: 9 });

    const result = cm.getContextPath(node);

    assert.deepEqual(
      result.map((x) => x.type),
      ["block", "formal_parameters", "program"]
    );
  });

  it("getContextPath 5", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  public void foo(int aaaa) {
    int z = aaaaa;
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 3, column: 16 });

    const result = cm.getContextPath(node);

    assert.deepEqual(
      result.map((x) => x.type),
      ["block", "formal_parameters", "class_body", "program"]
    );
  });

  it("getContext 1", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  ptr Y yyyy;
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 2, column: 9 });

    const result = cm.getContext(node);

    assert.deepEqual(
      result.map((a) => a.map((d) => d.type)),
      [["field_declaration"], ["class_declaration"]]
    );
  });

  it("getDeclarationIdentifier 1", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
int x = 1;
`;
    const node = parser
      .parse(input)
      .rootNode.descendantsOfType("local_variable_declaration")[0];

    const result = cm.getDeclarationIdentifier(node);

    assert.deepEqual(result[0].text, "x");
  });

  it("getDeclarationIdentifier 2", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantsOfType("class_declaration")[0];

    const result = cm.getDeclarationIdentifier(node);

    assert.deepEqual(result[0].text, "X");
  });

  it("getDeclarationIdentifier 3", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
enum X {}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantsOfType("enum_declaration")[0];

    const result = cm.getDeclarationIdentifier(node);

    assert.deepEqual(result[0].text, "X");
  });

  it("getDeclarationIdentifier 4", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
void foo() {}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantsOfType("function_declaration")[0];

    const result = cm.getDeclarationIdentifier(node);

    assert.deepEqual(result[0].text, "foo");
  });

  it("getDeclarationIdentifier 5", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  private void xxxx() {}
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantsOfType("method_declaration")[0];

    const result = cm.getDeclarationIdentifier(node);

    assert.deepEqual(result[0].text, "xxxx");
  });

  it("getDeclarationIdentifier 6", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
type ConsoleMessageArray = Array<ConsoleMessage>;
`;
    const node = parser
      .parse(input)
      .rootNode.descendantsOfType("local_type_declaration")[0];

    const result = cm.getDeclarationIdentifier(node);

    assert.deepEqual(result[0].text, "ConsoleMessageArray");
  });

  it("getDeclarationForIdentifier 1", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
    int xxxxx = 1;
    private void foo() {
        int a = xxxxx;
    }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 4, column: 19 });

    const result = cm.getDeclarationForIdentifier(node, "1.zs");

    assert.deepEqual(result.declaration.text, "int xxxxx = 1;");
  });

  it("getDeclarationForIdentifier 2", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  int y, xxxx;
  private void foo() {
    int a = xxxx;
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 4, column: 15 });

    const result = cm.getDeclarationForIdentifier(node, "1.zs");

    assert.deepEqual(result.declaration.text, "int y, xxxx;");
  });

  it("getDeclarationForIdentifier 3", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
enum EEE {
AAA,
}
class X {
    private void foo() {
        int a = EEE.AAA;
    }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 6, column: 18 });

    const result = cm.getDeclarationForIdentifier(node, "1.zs");

    assert.deepEqual(
      result.declaration.text,
      `enum EEE {
AAA,
}`
    );
  });

  it("getDeclarationForIdentifier 4", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
enum EEE {
AAA,
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 2, column: 2 });

    const result = cm.getDeclarationForIdentifier(node, "1.zs");

    assert.deepEqual(result.declaration.text, `AAA`);
  });

  it("getDeclarationForIdentifier 5", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
str x(str xxxx) {
  return xxxx;
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 2, column: 12 });

    const result = cm.getDeclarationForIdentifier(node, "1.zs");

    assert.deepEqual(result.declaration.text, `str xxxx`);
  });

  it("getDeclarationForIdentifier 6", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
void x(int y, DDD zzzz);
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 1, column: 21 });

    const result = cm.getDeclarationForIdentifier(node, "1.zs");

    assert.deepEqual(result.declaration.text, `DDD zzzz`);
  });

  it("getMembership 1", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  int y, xxxx;
  private void foo() {
    int a = xxxx;
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 2, column: 12 });

    const result = cm.getMembership(node);

    assert.deepEqual(
      result.map((n) => n.type),
      ["field_declaration", "class_declaration"]
    );
  });

  it("getMembership 2", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  int y, xxxx;
  private void foo() {
    int a = xxxx;
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 2, column: 12 });

    const result = cm.getMembership(node);

    assert.deepEqual(
      result.map((n) => n.type),
      ["field_declaration", "class_declaration"]
    );
  });

  it("getMembership 3", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  int y, xxxx;
  private void foo() {
    int a = xxxx;
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 3, column: 17 });

    const result = cm.getMembership(node);

    assert.deepEqual(
      result.map((n) => n.type),
      ["method_declaration", "class_declaration"]
    );
  });

  it("getMembership 4", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  private void foo(int x, YYY yyyyy ) {
    int z = yyyyy;
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 2, column: 34 });

    const result = cm.getMembership(node);

    assert.deepEqual(
      result.map((n) => n.type),
      ["formal_parameters", "method_declaration", "class_declaration"]
    );
  });

  it("getDeclarationType 1", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  int y, xxxx;
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantsOfType("field_declaration")[0];
    const result = cm.getDeclarationType(node);

    assert.deepEqual(result.text, "int");
  });

  it("getDeclarationType 2", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  private void foo() {}
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantsOfType("method_declaration")[0];
    const result = cm.getDeclarationType(node);

    assert.deepEqual(result.text, "void");
  });

  it("preproc 1", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
#include "123.zs"
#ifndef X
#define X
class X {
#if 1
  int y, xxxx;
#elif 2
  int z;
#else
  int z;
#endif
  private void foo() {
    int a = xxxx;
  }
}
#endif // X
`;
    const result = cm.preprocess(input);
    const expected = `
#include "123.zs"
//#ifndef X
#define X
class X {
//#if 1
//  int y, xxxx;
//#elif 2
//  int z;
//#else
  int z;
//#endif
  private void foo() {
    int a = xxxx;
  }
}
//#endif // X
`;

    assert.deepEqual(result, expected);
  });

  it("getParams 1", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  private void foo(int x, YYY y ) {}
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantsOfType("method_declaration")[0];

    const result = cm.getParams(node);

    assert.deepEqual(
      result.map((x) => x.text),
      ["int x", "YYY y"]
    );
  });

  it("getDeclaration 1", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  private void foo(int x, YYY yyyyy) {
    int z = yyyyy;
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 3, column: 16 });

    const result = cm.getDeclaration(node, "1.zs");
    assert.deepEqual(result.declaration.text, "YYY yyyyy");
  });

  it("getDeclaration 2", async () => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  private void yyyy() {}
}
X x = X{};
x.yyyy();
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 5, column: 5 });

    const result = cm.getDeclaration(node, "1.zs");
    assert.deepEqual(result.declaration.childForFieldName("name").text, "yyyy");
  });

  it("getDeclaration 3", async () => {
    const cm = new ContextManager(lsp);
    const input = `
class XXX {
  void zzzz() {}
}
class X {
  XXX yyyy;
  private void d() {
    yyyy.zzzz();
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 7, column: 12 });

    const result = cm.getDeclaration(node, "1.zs");
    assert.deepEqual(result.declaration.childForFieldName("name").text, "zzzz");
  });

  it("getDeclaration 4", async () => {
    const cm = new ContextManager(lsp);
    const input = `
class XXX {
  void zzzz() {
    for (int iiiiiii = 0; iiiiiii < 10; iiiiiii++) {
      iiiiiii++
    }
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 4, column: 11 });

    const result = cm.getDeclaration(node, "1.zs");

    assert.deepEqual(
      result.ctx.map((x) => x.map((y) => y.type)),
      [
        ["local_variable_declaration"],
        ["method_declaration"],
        ["class_declaration"],
      ]
    );
  });

  it("getDeclaration 5(generic)", async () => {
    const cm = new ContextManager(lsp);
    const input = `
native interface Array<Component P> {
  void zzzz();
}
type XXX = Array<DDD>; 
class X {
  XXX yyyy;
  void d() {
    yyyy.zzzz();
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 8, column: 12 });

    const result = cm.getDeclaration(node, "1.zs");

    assert.deepEqual(result.declaration.text, "void zzzz();");
  });

  it("getDeclaration 6(property)", async () => {
    const cm = new ContextManager(lsp);
    const input = `
interface ZZZZ {
  bool zzzz; zzzz = bool;
}
class X {
  ZZZZ yyyy;
  void d() {
    yyyy.zzzz = true;
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 7, column: 12 });

    const result = cm.getDeclaration(node, "1.zs");

    assert.deepEqual(result.declaration.text, "bool zzzz;");
  });

  it("getDeclaration 7(invocation)", async () => {
    const cm = new ContextManager(lsp);
    const input = `
class X {
  void yyyy(int a, int b) {}
  void d() {
    yyyy(1, 2);
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 4, column: 7 });

    const result = cm.getDeclaration(node, "1.zs");

    assert.deepEqual(result.declaration.text, "void yyyy(int a, int b) {}");
  });

  it("getDeclaration 8(method_signature)", async () => {
    const cm = new ContextManager(lsp);
    const input = `
void xxxx();
class X {
  void d() {
    xxxx();
  }
}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 4, column: 7 });

    const result = cm.getDeclaration(node, "1.zs");

    assert.deepEqual(result.declaration.text, "void xxxx();");
  });

  it("getDeclaration 9(inheritance)", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
  interface X {
    int xxxx;
  }
  interface Y : X {
    int y;
  }
  class Z {
    Y yyyy;
    private void foo() {
      yyyy.xxxx = 1;
    }
  }
  `;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 10, column: 12 });

    const result = cm.getDeclaration(node, "1.zs");

    assert.deepEqual(result.declaration.text, `int xxxx;`);
  });

  it("getDeclaration 10", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
native interface YYY {
  int dddd;
}
YYY yyyy;
int x() {
  return yyyy.dddd;
}
  `;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 6, column: 17 });

    const result = cm.getDeclaration(node, "1.zs");

    assert.deepEqual(result.declaration.text, `int dddd;`);
  });

  it("getDeclaration 11", async (t) => {
    const cm = new ContextManager(lsp);
    const input = `
class XXXX {
    public void xxxx(int x) {}
}
XXXX yyyy = XXXX{}.xxxx(1);
  `;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 4, column: 22 });

    const result = cm.getDeclaration(node, "1.zs");

    assert.deepEqual(result.declaration.text, `public void xxxx(int x) {}`);
  });

  it("getInheritance 1", async () => {
    const cm = new ContextManager(lsp);
    const input = `
interface FFFF {}
interface ZZZZ : FFFF {}
class XXX implements ZZZZ {}
class DDDD extends XXX {}
`;
    const node = parser
      .parse(input)
      .rootNode.descendantForPosition({ row: 4, column: 9 })

    const decl = cm.getDeclarationForIdentifier(node, "1.zs");

    const result = cm.getInheritance(decl, "1.zs");

    assert.deepEqual(
      result.map((x) => x.declaration.text),
      [
        "class XXX implements ZZZZ {}",
        "interface ZZZZ : FFFF {}",
        "interface FFFF {}",
      ]
    );
  });
});
