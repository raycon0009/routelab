import { describe, it, expect } from 'vitest';
import { grade, isRefusal, validateSchema, looseMatch } from './graders';

describe('isRefusal', () => {
  it('flags empty output', () => expect(isRefusal('   ')).toBe(true));
  it('flags "I\'m sorry"', () =>
    expect(isRefusal("I'm sorry, but I can't help with that.")).toBe(true));
  it('flags "I cannot assist"', () =>
    expect(isRefusal('I cannot assist with this request')).toBe(true));
  it('does not flag normal answers', () => expect(isRefusal('{"label":"allow"}')).toBe(false));
  it('does not flag a late "sorry"', () => {
    expect(isRefusal('x'.repeat(400) + " I'm sorry")).toBe(false);
  });
});

describe('exact', () => {
  it('matches trimmed', () => expect(grade({ type: 'exact' }, ' OK \n', 'OK').correct).toBe(true));
  it('is case sensitive', () => expect(grade({ type: 'exact' }, 'ok', 'OK').correct).toBe(false));
  it('null when no expected', () =>
    expect(grade({ type: 'exact' }, 'ok', undefined).correct).toBeNull());
});

describe('enum', () => {
  const spec = { type: 'enum', values: ['allow', 'remove', 'escalate'] } as const;
  it('reads label from JSON', () => {
    expect(grade(spec, '{"label":"Remove","reason":"x"}', 'remove').correct).toBe(true);
  });
  it('reads a bare string', () => expect(grade(spec, 'ALLOW', 'allow').correct).toBe(true));
  it('wrong label is incorrect', () =>
    expect(grade(spec, '{"label":"allow"}', 'remove').correct).toBe(false));
  it('label outside the enum is a schema failure', () => {
    const r = grade(spec, '{"label":"banana"}', 'allow');
    expect(r.schemaOk).toBe(false);
    expect(r.correct).toBe(false);
  });
  it('JSON without the field is a schema failure', () => {
    expect(grade(spec, '{"x":1}', 'allow').schemaOk).toBe(false);
  });
});

describe('contains', () => {
  it('requires all keywords, case-insensitive', () => {
    expect(
      grade({ type: 'contains' }, 'Chop the ONION and garlic', ['onion', 'garlic']).correct,
    ).toBe(true);
  });
  it('fails when one is missing and says which', () => {
    const r = grade({ type: 'contains' }, 'onion only', ['onion', 'garlic']);
    expect(r.correct).toBe(false);
    expect(r.note).toContain('garlic');
  });
});

describe('jsonSchemaValid', () => {
  const schema = {
    type: 'object',
    required: ['ingredients', 'totalMinutes'],
    properties: {
      ingredients: { type: 'array', items: { type: 'string' } },
      totalMinutes: { type: 'integer' },
    },
  } as const;
  const spec = { type: 'jsonSchemaValid', schema } as const;
  it('accepts valid output with matching expected', () => {
    const out = '{"ingredients":["Flour","Egg","salt"],"totalMinutes":30}';
    expect(grade(spec, out, { ingredients: ['flour', 'egg'], totalMinutes: 30 }).correct).toBe(
      true,
    );
  });
  it('rejects wrong values', () => {
    const out = '{"ingredients":["flour"],"totalMinutes":31}';
    expect(grade(spec, out, { totalMinutes: 30 }).correct).toBe(false);
  });
  it('rejects non-JSON as schema failure', () => {
    const r = grade(spec, 'here you go: flour', undefined);
    expect(r.schemaOk).toBe(false);
  });
  it('rejects missing required property', () => {
    expect(grade(spec, '{"ingredients":[]}', undefined).schemaOk).toBe(false);
  });
  it('strips markdown fences', () => {
    expect(
      grade(spec, '```json\n{"ingredients":[],"totalMinutes":1}\n```', undefined).schemaOk,
    ).toBe(true);
  });
});

describe('regex', () => {
  it('matches', () =>
    expect(grade({ type: 'regex', pattern: '^[0-9]+$' }, '42', undefined).correct).toBe(true));
  it('does not match', () =>
    expect(grade({ type: 'regex', pattern: '^[0-9]+$' }, 'x', undefined).correct).toBe(false));
});

describe('llmJudge stub', () => {
  it('throws not implemented', () => {
    expect(() => grade({ type: 'llmJudge' }, 'x', undefined)).toThrow(/not implemented/);
  });
});

describe('helpers', () => {
  it('validateSchema reports enum violations', () => {
    expect(validateSchema('x', { enum: ['a'] })).toHaveLength(1);
  });
  it('looseMatch arrays are subset-based', () => {
    expect(looseMatch(['a'], ['A', 'b'])).toBe(true);
    expect(looseMatch(['c'], ['a', 'b'])).toBe(false);
  });
});
