// Builds datasets/summary.recipes.json and datasets/extraction.recipes.json.
// All text is original, generated from the specs below. Run: npm run write:recipes
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

interface Spec {
  name: string;
  ingredients: string[];
  minutes: number;
  method: string;
}

const SPECS: Spec[] = [
  {
    name: 'Tomato soup',
    ingredients: ['tomatoes', 'onion', 'garlic', 'basil', 'olive oil', 'vegetable stock'],
    minutes: 35,
    method: 'simmer',
  },
  {
    name: 'Lemon pasta',
    ingredients: ['spaghetti', 'lemon', 'parmesan', 'butter', 'black pepper', 'parsley'],
    minutes: 20,
    method: 'toss',
  },
  {
    name: 'Chickpea curry',
    ingredients: ['chickpeas', 'coconut milk', 'ginger', 'turmeric', 'spinach', 'rice'],
    minutes: 40,
    method: 'simmer',
  },
  {
    name: 'Banana bread',
    ingredients: ['bananas', 'flour', 'sugar', 'eggs', 'butter', 'walnuts'],
    minutes: 75,
    method: 'bake',
  },
  {
    name: 'Greek salad',
    ingredients: ['cucumber', 'feta', 'olives', 'tomatoes', 'red onion', 'oregano'],
    minutes: 10,
    method: 'toss',
  },
  {
    name: 'Mushroom risotto',
    ingredients: ['arborio rice', 'mushrooms', 'white wine', 'shallot', 'parmesan', 'thyme'],
    minutes: 45,
    method: 'stir',
  },
  {
    name: 'Veggie fried rice',
    ingredients: ['cooked rice', 'carrots', 'peas', 'soy sauce', 'eggs', 'spring onions'],
    minutes: 15,
    method: 'fry',
  },
  {
    name: 'Blueberry muffins',
    ingredients: ['blueberries', 'flour', 'milk', 'sugar', 'baking powder', 'vanilla'],
    minutes: 35,
    method: 'bake',
  },
  {
    name: 'Lentil stew',
    ingredients: ['green lentils', 'carrots', 'celery', 'cumin', 'tomato paste', 'bay leaf'],
    minutes: 50,
    method: 'simmer',
  },
  {
    name: 'Avocado toast',
    ingredients: ['sourdough', 'avocado', 'lime', 'chilli flakes', 'sea salt', 'radish'],
    minutes: 8,
    method: 'assemble',
  },
  {
    name: 'Roast potatoes',
    ingredients: ['potatoes', 'rosemary', 'garlic', 'olive oil', 'sea salt', 'paprika'],
    minutes: 60,
    method: 'roast',
  },
  {
    name: 'Pancakes',
    ingredients: ['flour', 'buttermilk', 'eggs', 'sugar', 'butter', 'maple syrup'],
    minutes: 25,
    method: 'fry',
  },
  {
    name: 'Shakshuka',
    ingredients: ['eggs', 'tomatoes', 'red pepper', 'cumin', 'paprika', 'feta'],
    minutes: 30,
    method: 'simmer',
  },
  {
    name: 'Oat cookies',
    ingredients: ['rolled oats', 'brown sugar', 'butter', 'raisins', 'cinnamon', 'egg'],
    minutes: 30,
    method: 'bake',
  },
  {
    name: 'Cucumber raita',
    ingredients: ['yoghurt', 'cucumber', 'cumin', 'mint', 'salt', 'green chilli'],
    minutes: 10,
    method: 'stir',
  },
  {
    name: 'Pumpkin soup',
    ingredients: ['pumpkin', 'onion', 'ginger', 'cream', 'nutmeg', 'vegetable stock'],
    minutes: 45,
    method: 'simmer',
  },
  {
    name: 'Garlic bread',
    ingredients: ['baguette', 'garlic', 'butter', 'parsley', 'salt', 'mozzarella'],
    minutes: 15,
    method: 'bake',
  },
  {
    name: 'Paneer wrap',
    ingredients: ['paneer', 'tortillas', 'bell pepper', 'onion', 'yoghurt', 'garam masala'],
    minutes: 25,
    method: 'fry',
  },
  {
    name: 'Apple crumble',
    ingredients: ['apples', 'oats', 'butter', 'brown sugar', 'cinnamon', 'flour'],
    minutes: 55,
    method: 'bake',
  },
  {
    name: 'Miso noodles',
    ingredients: ['udon noodles', 'miso paste', 'tofu', 'spring onions', 'sesame oil', 'spinach'],
    minutes: 20,
    method: 'simmer',
  },
  {
    name: 'Hummus',
    ingredients: ['chickpeas', 'tahini', 'lemon', 'garlic', 'olive oil', 'cumin'],
    minutes: 12,
    method: 'blend',
  },
  {
    name: 'Vegetable pulao',
    ingredients: ['basmati rice', 'carrots', 'peas', 'cloves', 'cardamom', 'onion'],
    minutes: 40,
    method: 'simmer',
  },
  {
    name: 'French toast',
    ingredients: ['bread', 'eggs', 'milk', 'cinnamon', 'butter', 'honey'],
    minutes: 15,
    method: 'fry',
  },
  {
    name: 'Coleslaw',
    ingredients: ['cabbage', 'carrot', 'mayonnaise', 'vinegar', 'mustard', 'celery seed'],
    minutes: 15,
    method: 'toss',
  },
  {
    name: 'Potato curry',
    ingredients: ['potatoes', 'tomatoes', 'mustard seeds', 'turmeric', 'curry leaves', 'coriander'],
    minutes: 35,
    method: 'simmer',
  },
];

const TIPS = [
  'Use the freshest ingredients you can find; it makes a visible difference to the finished dish.',
  'If you are cooking for a crowd, double the quantities but keep the same pan size for even results.',
  'Leftovers keep well in a sealed container in the fridge for up to three days.',
  'Taste as you go and adjust the seasoning at the end rather than the beginning.',
  'Let everything rest for a few minutes before serving so the flavours settle.',
  'Warm the plates in a low oven if you want the food to stay hot at the table.',
  'A small splash of water can rescue a pan that is starting to catch on the bottom.',
  'Prepare all of the ingredients before you turn on the heat; the cooking goes quickly.',
];

function recipeText(s: Spec, extraTips: number): string {
  const [a, b, c, d, e, f] = s.ingredients;
  const parts = [
    `${s.name}.`,
    `You will need: ${s.ingredients.join(', ')}.`,
    `Start by preparing the ${a} and the ${b}. Then ${s.method} them together with the ${c}, adding the ${d} a little at a time.`,
    `Finish with the ${e} and the ${f}, and check the seasoning.`,
  ];
  for (let i = 0; i < extraTips; i++) parts.push(TIPS[(i + s.minutes) % TIPS.length]!);
  parts.push(`Total time: ${s.minutes} minutes.`);
  return parts.join(' ');
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', '..', 'datasets');

// Vary length: 0..24 extra tips -> roughly 200..3000+ chars
const summaryCases = SPECS.map((s, i) => {
  const tips = Math.floor((i * 24) / (SPECS.length - 1));
  const input = recipeText(s, tips);
  return {
    id: `summary-${i + 1}`,
    input,
    expected: [s.ingredients[0], s.ingredients[1], String(s.minutes)],
  };
});

const extractionCases = SPECS.slice(0, 20).map((s, i) => ({
  id: `extract-${i + 1}`,
  input: recipeText(s, i % 4),
  expected: { ingredients: s.ingredients, totalMinutes: s.minutes },
}));

writeFileSync(
  join(outDir, 'summary.recipes.json'),
  JSON.stringify(
    {
      id: 'summary.recipes',
      title: 'Recipe summaries (synthetic, original text)',
      source: 'Generated by tools/datasets/src/recipes.ts',
      license: 'Apache-2.0 (original)',
      grader: 'contains',
      note: 'expected = keywords that a good two-sentence summary should mention (two main ingredients and the total minutes).',
      cases: summaryCases,
    },
    null,
    1,
  ),
);
writeFileSync(
  join(outDir, 'extraction.recipes.json'),
  JSON.stringify(
    {
      id: 'extraction.recipes',
      title: 'Recipe extraction (synthetic, original text)',
      source: 'Generated by tools/datasets/src/recipes.ts',
      license: 'Apache-2.0 (original)',
      grader: 'jsonSchemaValid',
      cases: extractionCases,
    },
    null,
    1,
  ),
);
console.log('lengths', summaryCases.map((c) => c.input.length).join(','));
