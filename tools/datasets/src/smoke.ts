// Cloud smoke test (1-2 calls). Run: npx tsx tools/datasets/src/smoke.ts
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseConfig } from '../../../packages/shared/src/firebaseConfig';
import { CLOUD_MODEL } from '../../../packages/shared/src/config';

const ai = getAI(initializeApp(firebaseConfig), { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, {
  model: CLOUD_MODEL,
  generationConfig: {
    responseMimeType: 'application/json',
    responseJsonSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', enum: ['allow', 'remove', 'escalate'] },
        reason: { type: 'string' },
      },
      required: ['label', 'reason'],
    },
  },
});
try {
  const r = await model.generateContent('Classify this comment: "Great recipe, thanks!"');
  console.log(r.response.text(), JSON.stringify(r.response.usageMetadata));
} catch (e) {
  console.log('ERR', (e as Error).message.slice(0, 400));
}
