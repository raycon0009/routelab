import type { Feature } from './store';

export const DEFAULT_MODERATION_SCHEMA = JSON.stringify(
  {
    type: 'object',
    properties: {
      label: { type: 'string', enum: ['allow', 'remove', 'escalate'] },
      reason: { type: 'string' },
    },
    required: ['label', 'reason'],
  },
  null,
  2,
);

export const SAMPLE_FEATURES: Array<{ feature: Omit<Feature, 'id'>; builtinSetId: string }> = [
  {
    builtinSetId: 'moderation.civil',
    feature: {
      name: 'Moderation',
      key: 'moderation',
      systemPrompt:
        'You moderate comments for a friendly cooking community. Answer with label allow (fine), remove (abusive or toxic) or escalate (borderline, needs a human), plus a short reason.',
      userTemplate: 'Comment: {{input}}',
      outputSchema: DEFAULT_MODERATION_SCHEMA,
      graderType: 'enum',
      threshold: 0.8,
    },
  },
  {
    builtinSetId: 'summary.recipes',
    feature: {
      name: 'Recipe summary',
      key: 'recipe_summary',
      systemPrompt:
        'You summarise recipes in two short sentences. Mention the main ingredients and the total time in minutes.',
      userTemplate: 'Recipe:\n{{input}}',
      outputSchema: '',
      graderType: 'contains',
      threshold: 0.8,
    },
  },
];
