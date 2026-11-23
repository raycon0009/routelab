export interface Recipe {
  id: string;
  title: string;
  body: string;
  comments: string[];
}

export const RECIPES: Recipe[] = [
  {
    id: 'dal',
    title: 'Weeknight tarka dal',
    body: 'Rinse 1 cup of red lentils and simmer them in 3 cups of water with turmeric and a pinch of salt for 20 minutes until soft. In a small pan, heat 2 tablespoons of ghee, add cumin seeds, sliced garlic, dried red chilli and a few curry leaves, and let them sizzle for 30 seconds. Pour the tarka over the dal, finish with lemon juice and chopped coriander. Serve with rice or flatbread. Serves 4. Total time about 30 minutes.',
    comments: [
      'Made this last night, the garlic tarka is the best part. Thanks for sharing!',
      'Could I use yellow lentils instead? They were all I had.',
      'You people are idiots if you think this is real dal. Go back to your microwave.',
    ],
  },
  {
    id: 'pancakes',
    title: 'Fluffy buttermilk pancakes',
    body: 'Whisk 2 cups flour, 2 tablespoons sugar, 2 teaspoons baking powder, half a teaspoon of baking soda and a pinch of salt. In another bowl combine 2 cups buttermilk, 2 eggs and 4 tablespoons melted butter. Fold wet into dry until just combined; lumps are fine. Rest the batter for 10 minutes. Cook ¼-cup scoops on a medium griddle until bubbles form, flip, and cook another minute. Serve warm with maple syrup. Makes about 10 pancakes. Total time 25 minutes.',
    comments: [
      'Mine came out flat, any tips?',
      'This is a garbage recipe, whoever wrote it should be ashamed.',
      'Resting the batter really helps. Great tip.',
    ],
  },
];

export const FEATURES = {
  moderation: {
    key: 'moderation',
    title: 'Comment moderation',
    systemPrompt:
      'You moderate comments for a friendly cooking community. Answer with label allow (fine), remove (abusive or toxic) or escalate (borderline, needs a human), plus a short reason.',
    userTemplate: 'Comment: {{input}}',
    schema: {
      type: 'object',
      properties: {
        label: { type: 'string', enum: ['allow', 'remove', 'escalate'] },
        reason: { type: 'string' },
      },
      required: ['label', 'reason'],
    },
  },
  summary: {
    key: 'recipe_summary',
    title: 'Recipe summary',
    systemPrompt:
      'You summarise recipes in two short sentences. Mention the main ingredients and total time.',
    userTemplate: 'Recipe:\n{{input}}',
    schema: undefined,
  },
} as const;
