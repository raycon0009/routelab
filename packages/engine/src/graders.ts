import type { GradeResult, GraderSpec, JsonSchema } from './types';

const REFUSAL_PATTERNS: RegExp[] = [
  /\bI(?:'m| am)? (?:sorry|unable|not able)\b/i,
  /\bI can(?:'|no)?t (?:help|assist|comply|process|answer|do that|provide)/i,
  /\bI cannot (?:help|assist|comply|process|answer|provide|fulfil)/i,
  /\bas an ai\b/i,
  /\bI(?:'m| am) not (?:able|allowed|permitted) to\b/i,
  /\bagainst my (?:guidelines|policy|policies)\b/i,
  /\b(?:violates?|against) (?:our|the) (?:content )?polic(?:y|ies)\b/i,
];

/** Empty output or typical refusal phrasing. Only the first 300 chars are inspected. */
export function isRefusal(output: string): boolean {
  const t = output.trim();
  if (t.length === 0) return true;
  const head = t.slice(0, 300);
  return REFUSAL_PATTERNS.some((p) => p.test(head));
}

export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const t = text.trim();
  const stripped = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return { ok: true, value: JSON.parse(stripped) };
  } catch {
    return { ok: false };
  }
}

/** Validates against the small JSON-schema subset in types.ts. Returns error strings (empty = valid). */
export function validateSchema(value: unknown, schema: JsonSchema, path = '$'): string[] {
  const errors: string[] = [];
  if (schema.enum && !schema.enum.some((e) => e === value)) {
    errors.push(`${path}: value not in enum`);
  }
  switch (schema.type) {
    case undefined:
      break;
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${path}: expected object`);
        break;
      }
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (!(key in obj)) errors.push(`${path}.${key}: missing required property`);
      }
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (key in obj) errors.push(...validateSchema(obj[key], sub, `${path}.${key}`));
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array`);
        break;
      }
      if (schema.items) {
        value.forEach((v, i) => errors.push(...validateSchema(v, schema.items!, `${path}[${i}]`)));
      }
      break;
    }
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}: expected string`);
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value))
        errors.push(`${path}: expected number`);
      break;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value))
        errors.push(`${path}: expected integer`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean`);
      break;
    case 'null':
      if (value !== null) errors.push(`${path}: expected null`);
      break;
  }
  return errors;
}

/** Loose structural match: strings case-insensitive, arrays as "every expected item is present". */
export function looseMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'string') {
    return (
      typeof actual === 'string' && expected.trim().toLowerCase() === actual.trim().toLowerCase()
    );
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((e) => actual.some((a) => looseMatch(e, a)));
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') return false;
    return Object.entries(expected as Record<string, unknown>).every(([k, v]) =>
      looseMatch(v, (actual as Record<string, unknown>)[k]),
    );
  }
  return expected === actual;
}

export function gradeExact(output: string, expected: unknown): GradeResult {
  return {
    correct: expected === undefined ? null : output.trim() === String(expected).trim(),
    schemaOk: true,
    refusal: isRefusal(output),
  };
}

export function gradeEnum(
  output: string,
  expected: unknown,
  spec: Extract<GraderSpec, { type: 'enum' }>,
): GradeResult {
  const refusal = isRefusal(output);
  let label: string = output.trim();
  const parsed = tryParseJson(output);
  if (parsed.ok) {
    const field = spec.field ?? 'label';
    const v = parsed.value;
    if (typeof v === 'string') label = v;
    else if (
      v &&
      typeof v === 'object' &&
      typeof (v as Record<string, unknown>)[field] === 'string'
    ) {
      label = (v as Record<string, string>)[field]!;
    } else {
      return { correct: false, schemaOk: false, refusal, note: `missing field "${field}"` };
    }
  }
  label = label.trim().toLowerCase();
  const allowed = spec.values?.map((x) => x.toLowerCase());
  const schemaOk = allowed ? allowed.includes(label) : true;
  if (!schemaOk)
    return { correct: false, schemaOk, refusal, note: `"${label}" is not an allowed label` };
  return {
    correct: expected === undefined ? null : label === String(expected).trim().toLowerCase(),
    schemaOk,
    refusal,
  };
}

export function gradeContains(output: string, expected: unknown): GradeResult {
  const refusal = isRefusal(output);
  const keywords = Array.isArray(expected)
    ? expected.map(String)
    : expected === undefined
      ? null
      : [String(expected)];
  if (!keywords) return { correct: null, schemaOk: true, refusal };
  const lower = output.toLowerCase();
  const missing = keywords.filter((k) => !lower.includes(k.toLowerCase()));
  return {
    correct: missing.length === 0,
    schemaOk: true,
    refusal,
    note: missing.length ? `missing: ${missing.join(', ')}` : undefined,
  };
}

export function gradeJsonSchema(
  output: string,
  expected: unknown,
  spec: Extract<GraderSpec, { type: 'jsonSchemaValid' }>,
): GradeResult {
  const refusal = isRefusal(output);
  const parsed = tryParseJson(output);
  if (!parsed.ok)
    return { correct: false, schemaOk: false, refusal, note: 'output is not valid JSON' };
  const errors = validateSchema(parsed.value, spec.schema);
  if (errors.length) return { correct: false, schemaOk: false, refusal, note: errors[0] };
  return {
    correct: expected === undefined ? true : looseMatch(expected, parsed.value),
    schemaOk: true,
    refusal,
  };
}

export function gradeRegex(
  output: string,
  spec: Extract<GraderSpec, { type: 'regex' }>,
): GradeResult {
  const re = new RegExp(spec.pattern, spec.flags ?? 'i');
  return { correct: re.test(output), schemaOk: true, refusal: isRefusal(output) };
}

/** Typed stub: the LLM judge is deliberately not implemented yet (cut from the first build). */
export function gradeLlmJudge(): GradeResult {
  throw new Error('llmJudge grader is not implemented');
}

export function grade(spec: GraderSpec, output: string, expected: unknown): GradeResult {
  switch (spec.type) {
    case 'exact':
      return gradeExact(output, expected);
    case 'enum':
      return gradeEnum(output, expected, spec);
    case 'contains':
      return gradeContains(output, expected);
    case 'jsonSchemaValid':
      return gradeJsonSchema(output, expected, spec);
    case 'regex':
      return gradeRegex(output, spec);
    case 'llmJudge':
      return gradeLlmJudge();
  }
}
