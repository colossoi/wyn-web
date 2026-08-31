import wrapperTemplate from "./templates/main_image.wyn?raw";

const USER_MARKER = "-- PLAYGROUND_USER_SOURCE";
const ENTRY_MARKER = "-- PLAYGROUND_ENTRY_PARAMETERS";
const ARGUMENT_MARKER = "-- PLAYGROUND_MAIN_IMAGE_ARGUMENTS";
const RESERVED_PREFIX = "__playground_";

const IMAGE_INPUT_TYPES = {
  iResolution: "vec3f32",
  iTime: "f32",
  iTimeDelta: "f32",
  iFrameRate: "f32",
  iFrame: "i32",
  iChannelTime: "[4]f32",
  iChannelResolution: "[4]vec3f32",
  iMouse: "vec4f32",
  iDate: "vec4f32",
  iSampleRate: "f32",
  frag_coord: "vec2f32",
} as const;

interface Parameter {
  name: string;
  type: string;
}

export interface SourceLocation {
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
}

export interface PreparedSource {
  source: string;
  mapLocation(location: SourceLocation | null): SourceLocation | null;
  generated: boolean;
}

export class PlaygroundSourceError extends Error {
  location: SourceLocation | null;

  constructor(message: string, location: SourceLocation | null = null) {
    super(message);
    this.name = "PlaygroundSourceError";
    this.location = location;
  }
}

/**
 * Turn a playground main_image function into a complete Wyn image pipeline.
 * The expanded source exists only for compilation; the editor and database
 * retain the user's source alone.
 */
export function preparePlaygroundSource(userSource: string): PreparedSource {
  const tokens = identifierTokens(userSource);
  const declaration = findMainImageDeclaration(userSource, tokens);
  rejectReservedNames(tokens, userSource);
  const parameters = parseParameters(userSource, declaration.open, declaration.close);
  validateParameters(parameters, userSource, declaration.nameOffset);

  const entryParameters = parameters
    .filter(({ name }) => name !== "frag_coord")
    .map(({ name, type }) => `            ${name}: ${type},`)
    .join("\n");
  const argumentsText = parameters
    .map(({ name }) =>
      `      ${name === "frag_coord" ? "fragment.position.xy" : name},`
    )
    .join("\n")
    .replace(/,$/, "");

  const userMarkerOffset = wrapperTemplate.indexOf(USER_MARKER);
  if (userMarkerOffset < 0) {
    throw new Error(`Playground wrapper is missing ${USER_MARKER}`);
  }
  const beforeUser = wrapperTemplate.slice(0, userMarkerOffset);
  let afterUser = wrapperTemplate.slice(
    userMarkerOffset + USER_MARKER.length,
  );
  afterUser = replaceOnce(afterUser, ENTRY_MARKER, entryParameters);
  afterUser = replaceOnce(afterUser, ARGUMENT_MARKER, argumentsText);

  const prefix = beforeUser.endsWith("\n") ? beforeUser : `${beforeUser}\n`;
  const suffix = afterUser.startsWith("\n") ? afterUser : `\n${afterUser}`;
  const source = `${prefix}${userSource}${suffix}`;
  const firstUserLine = countLines(prefix);
  const userLineCount = countLines(userSource);

  return {
    source,
    generated: true,
    mapLocation(location) {
      if (!location) return null;
      const lastUserLine = firstUserLine + userLineCount - 1;
      if (
        location.start_line < firstUserLine ||
        location.end_line > lastUserLine
      ) {
        return null;
      }
      const lineOffset = firstUserLine - 1;
      return {
        ...location,
        start_line: location.start_line - lineOffset,
        end_line: location.end_line - lineOffset,
      };
    },
  };
}

interface IdentifierToken {
  text: string;
  offset: number;
}

function identifierTokens(source: string): IdentifierToken[] {
  const tokens: IdentifierToken[] = [];
  for (let i = 0; i < source.length; ) {
    if (source[i] === "-" && source[i + 1] === "-") {
      i = source.indexOf("\n", i + 2);
      if (i < 0) break;
      continue;
    }
    if (/[A-Za-z_]/.test(source[i] ?? "")) {
      const start = i++;
      while (/[A-Za-z0-9_]/.test(source[i] ?? "")) i++;
      tokens.push({ text: source.slice(start, i), offset: start });
      continue;
    }
    i++;
  }
  return tokens;
}

function findMainImageDeclaration(
  source: string,
  tokens: IdentifierToken[],
): { open: number; close: number; nameOffset: number } {
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i].text !== "def" || tokens[i + 1].text !== "main_image") continue;
    const nameOffset = tokens[i + 1].offset;
    const open = skipWhitespace(source, nameOffset + "main_image".length);
    if (source[open] !== "(") {
      throw sourceError(source, nameOffset, "main_image must be a function");
    }
    const close = matchingParen(source, open);
    const equals = findBodyEquals(source, close + 1);
    if (equals < 0) {
      throw sourceError(source, nameOffset, "main_image is missing its body");
    }
    const returnType = normalizeType(source.slice(close + 1, equals));
    if (returnType !== "vec4f32") {
      throw sourceError(
        source,
        nameOffset,
        `main_image must return vec4f32, not ${returnType || "an inferred type"}`,
      );
    }
    return { open, close, nameOffset };
  }
  throw new PlaygroundSourceError(
    "Playground shaders must define main_image(...).",
  );
}

function parseParameters(source: string, open: number, close: number): Parameter[] {
  const body = source.slice(open + 1, close).replace(/--[^\n]*/g, "");
  if (!body.trim()) return [];
  return splitTopLevel(body, ",").map((raw) => {
    const colon = findTopLevel(raw, ":");
    if (colon < 0) {
      throw sourceError(source, open + 1, `main_image parameter “${raw.trim()}” needs a type`);
    }
    return {
      name: raw.slice(0, colon).trim(),
      type: normalizeType(raw.slice(colon + 1)),
    };
  });
}

function validateParameters(
  parameters: Parameter[],
  source: string,
  declarationOffset: number,
): void {
  const seen = new Set<string>();
  for (const parameter of parameters) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parameter.name)) {
      throw sourceError(source, declarationOffset, `Invalid main_image parameter name “${parameter.name}”`);
    }
    if (seen.has(parameter.name)) {
      throw sourceError(source, declarationOffset, `Duplicate main_image parameter “${parameter.name}”`);
    }
    seen.add(parameter.name);
    const expected = IMAGE_INPUT_TYPES[parameter.name as keyof typeof IMAGE_INPUT_TYPES];
    if (!expected) {
      throw sourceError(source, declarationOffset, `Unsupported main_image input “${parameter.name}”`);
    }
    if (parameter.type !== expected) {
      throw sourceError(
        source,
        declarationOffset,
        `${parameter.name} must have type ${expected}, not ${parameter.type}`,
      );
    }
  }
}

function rejectReservedNames(tokens: IdentifierToken[], source: string): void {
  const token = tokens.find(({ text }) => text.startsWith(RESERVED_PREFIX));
  if (token) {
    throw sourceError(
      source,
      token.offset,
      `Names beginning with ${RESERVED_PREFIX} are reserved by the playground`,
    );
  }
}

function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "-" && source[i + 1] === "-") {
      const newline = source.indexOf("\n", i + 2);
      if (newline < 0) break;
      i = newline;
    } else if (source[i] === "(") {
      depth++;
    } else if (source[i] === ")" && --depth === 0) {
      return i;
    }
  }
  throw sourceError(source, open, "Unclosed main_image parameter list");
}

function findBodyEquals(source: string, offset: number): number {
  for (let i = offset; i < source.length; i++) {
    if (source[i] === "-" && source[i + 1] === "-") {
      const newline = source.indexOf("\n", i + 2);
      if (newline < 0) return -1;
      i = newline;
    } else if (source[i] === "=") {
      return i;
    }
  }
  return -1;
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let square = 0;
  let angle = 0;
  let paren = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "[") square++;
    else if (source[i] === "]") square--;
    else if (source[i] === "<") angle++;
    else if (source[i] === ">") angle--;
    else if (source[i] === "(") paren++;
    else if (source[i] === ")") paren--;
    else if (source[i] === separator && square === 0 && angle === 0 && paren === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function findTopLevel(source: string, target: string): number {
  let square = 0;
  let angle = 0;
  let paren = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "[") square++;
    else if (source[i] === "]") square--;
    else if (source[i] === "<") angle++;
    else if (source[i] === ">") angle--;
    else if (source[i] === "(") paren++;
    else if (source[i] === ")") paren--;
    else if (source[i] === target && square === 0 && angle === 0 && paren === 0) return i;
  }
  return -1;
}

function normalizeType(type: string): string {
  return type.replace(/--[^\n]*/g, "").replace(/\s+/g, "");
}

function skipWhitespace(source: string, offset: number): number {
  while (/\s/.test(source[offset] ?? "")) offset++;
  return offset;
}

function countLines(source: string): number {
  return source.split("\n").length;
}

function replaceOnce(source: string, marker: string, value: string): string {
  const offset = source.indexOf(marker);
  if (offset < 0) return source;
  return source.slice(0, offset) + value + source.slice(offset + marker.length);
}

function sourceError(source: string, offset: number, message: string): PlaygroundSourceError {
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  const column = offset - lastNewline;
  return new PlaygroundSourceError(message, {
    start_line: line,
    start_col: column,
    end_line: line,
    end_col: column + 1,
  });
}
