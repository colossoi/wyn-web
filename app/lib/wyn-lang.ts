// Hand-written CodeMirror 6 StreamLanguage for Wyn.
//
// Intentionally NOT a full parser — just enough classification to color
// the code. Mirrors the tokens defined in `extra/tree-sitter-wyn/grammar.js`:
//
//   - line comments:       `-- ...` to EOL
//   - type hole:           `???`
//   - string literal:      `"..."` (lexical only — appears in `import "..."`
//                          and `#[linked("...")]`, not as a value)
//   - integer literal:     decimal / hex `0x...` / binary `0b...`, optional
//                          `[iu](8|16|32|64)` suffix
//   - float literal:       scientific + fractional, optional `f(16|32|64)` suffix
//   - keywords:            `def entry extern type type~ type^ module sig
//                           functor open import include let in if then else
//                           loop while do for match case with`
//   - builtins:            SOAC + intrinsic names
//   - primitive types:     `iN uN fN bool`
//   - builtin types:       scalar, vector/matrix, and graphics/resource types
//   - constructors:        `#name`
//   - attributes:          `#[ ... ]` including nested brackets
//   - operators / punctuation

import { StreamLanguage, LanguageSupport } from "@codemirror/language";
import type { StringStream } from "@codemirror/language";

const KEYWORDS = new Set([
  "def",
  "entry",
  "extern",
  "type",
  "module",
  "sig",
  "functor",
  "open",
  "import",
  "include",
  "let",
  "in",
  "if",
  "then",
  "else",
  "loop",
  "while",
  "do",
  "for",
  "match",
  "case",
  "with",
]);

// Wyn has no formal "builtin" concept — these are names the prelude
// exposes that a user reading code wants visually distinct from their
// own identifiers. Mostly SOACs plus the handful of intrinsic-like
// helpers shipped in the prelude.
const BUILTINS = new Set([
  "map",
  "reduce",
  "scan",
  "filter",
  "redomap",
  "iota",
  "zip",
  "zip2",
  "zip3",
  "unzip",
  "length",
  "all",
  "any",
]);

const PRIMITIVE_RE = /^(?:[iu](?:8|16|32|64)|f(?:16|32|64)|bool)$/;
const VEC_TYPE_RE = /^vec[234](?:i8|i16|i32|i64|u8|u16|u32|u64|f16|f32|f64|bool)$/;
// Matrix: `matNM...` with optional NxM; colN-rowM would parse the same.
const MAT_TYPE_RE = /^mat[234](?:x[234])?(?:i8|i16|i32|i64|u8|u16|u32|u64|f16|f32|f64|bool)$/;
const BUILTIN_TYPES = new Set([
  "texture2d",
  "sampler",
  "storage_image",
  "draw",
  "vertex",
  "raster",
  "fragment_invocation",
  "fragment_output",
  "render_target",
  "viewport",
  "scissor",
  "raster_state",
  "depth_test",
  "blend_mode",
  "fragment_state",
]);

function isTypeName(word: string): boolean {
  return (
    BUILTIN_TYPES.has(word) ||
    PRIMITIVE_RE.test(word) ||
    VEC_TYPE_RE.test(word) ||
    MAT_TYPE_RE.test(word)
  );
}

type State = { expectDefinition: boolean };

// Order matters: longer operators must come before shorter prefixes.
// `|>` before `|`, `..<` / `..>` before `..`, `>>>` before `>>`, etc.
const OP_RE =
  /^(?:\.\.\.|>>>|\.\.<|\.\.>|\.\.|->|:>|\|>|\|\||&&|==|!=|<=|>=|<<|>>|\*\*|\/\/|%%|::|[+\-*/%<>=!&|^~?])/;

function tokenize(stream: StringStream, state: State): string | null {
  if (stream.eatSpace()) return null;

  // Line comment: -- to EOL.
  if (stream.match(/^--.*/, true)) {
    return "comment";
  }

  // Type hole.
  if (stream.match("???")) return "atom";

  // Lifted type declarations are single keywords in the Wyn grammar. Match
  // them before the general identifier rule splits off the `type` prefix.
  if (stream.match(/^type[~^]/, true)) {
    state.expectDefinition = true;
    return "keyword";
  }

  // String literal "...". Wyn strings are lexical tokens only — used in
  // `import "path"` and `#[linked("name")]`. Not a valid expression.
  // Minimal escape handling; the grammar doesn't define escapes.
  if (stream.peek() === '"') {
    stream.next();
    while (!stream.eol()) {
      const ch = stream.next();
      if (ch === '"') break;
      if (ch === "\\" && !stream.eol()) stream.next();
    }
    return "string";
  }

  // Attribute: #[ ... ] (supports nested brackets). Tagged as
  // `annotation` rather than `meta` so themes style it distinct
  // from line comments — `meta` and `comment` share the same
  // muted color in monokai.
  if (stream.match("#[", true)) {
    let depth = 1;
    while (!stream.eol() && depth > 0) {
      const ch = stream.next();
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
    }
    return "annotation";
  }

  // Anonymous-sum constructors are #prefixed in expressions, patterns, and
  // types. Attributes were consumed above, so the forms cannot conflict.
  if (stream.match(/^#[a-zA-Z_][a-zA-Z0-9_']*/, true)) return "tag";

  // Vec literal marker `@[`: color the `@` as an operator, let `[` fall
  // through as punctuation. Keeps `@[x, y, z]` visually distinct from an
  // array literal `[x, y, z]`.
  if (stream.peek() === "@" && stream.string.charAt(stream.pos + 1) === "[") {
    stream.next();
    return "operator";
  }

  // Numbers. Longest match wins: hex / binary / float / integer.
  if (/[0-9]/.test(stream.peek() ?? "")) {
    if (stream.match(/^0[xX][0-9a-fA-F_]+(?:[iu](?:8|16|32|64))?/)) return "number";
    if (stream.match(/^0[bB][01_]+(?:[iu](?:8|16|32|64))?/)) return "number";
    if (stream.match(/^[0-9][0-9_]*\.[0-9][0-9_]*(?:[eE][+-]?[0-9]+)?(?:f(?:16|32|64))?/))
      return "number";
    if (stream.match(/^[0-9][0-9_]*[eE][+-]?[0-9]+(?:f(?:16|32|64))?/)) return "number";
    if (stream.match(/^[0-9][0-9_]*(?:[iu](?:8|16|32|64))?/)) return "number";
  }

  // Identifier: keyword / atom / builtin / type / variable.
  const idMatch = stream.match(/^[a-zA-Z_][a-zA-Z0-9_']*/) as RegExpMatchArray | null;
  if (idMatch) {
    const word = idMatch[0];
    if (word === "true" || word === "false") return "atom";
    if (KEYWORDS.has(word)) {
      state.expectDefinition = [
        "def",
        "entry",
        "extern",
        "let",
        "module",
        "functor",
        "sig",
        "type",
      ].includes(word);
      return "keyword";
    }
    if (state.expectDefinition) {
      state.expectDefinition = false;
      return "def";
    }
    if (BUILTINS.has(word)) return "builtin";
    if (isTypeName(word)) return "type";
    return "variable";
  }

  // Multi-char and single-char operators.
  if (stream.match(OP_RE)) {
    if (state.expectDefinition) {
      state.expectDefinition = false;
      return "def";
    }
    return "operator";
  }

  // Punctuation: brackets, parens, commas, dot, semicolon. Returning null
  // lets the theme apply default text color; the monokai theme already
  // handles bracket-matching highlighting separately.
  const ch = stream.next();
  if (ch && /[(){}\[\],;.]/.test(ch)) return null;
  return null;
}

export const wynLanguage = StreamLanguage.define<State>({
  name: "wyn",
  startState: () => ({ expectDefinition: false }),
  token: tokenize,
  languageData: {
    commentTokens: { line: "--" },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
  },
});

export function wyn(): LanguageSupport {
  return new LanguageSupport(wynLanguage);
}
