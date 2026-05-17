// lying assertion fixture — used by eslint-lying-assertion.spec.ts
// This file intentionally contains a banned pattern to verify ESLint catches it.
declare const foo: unknown;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const x = foo as string[]; // eslint should flag this
export {};
