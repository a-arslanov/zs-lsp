export const enumQ = `
(enum_declaration
  name: (identifier) @name
  body: (_ (enumerator
    name: (identifier) @key
    value: (_)? @value)))`; 