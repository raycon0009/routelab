/** Public Firebase web client config (not a secret). Restrict the API key to our domains before submission. */
export const firebaseConfig = {
  apiKey: 'AIzaSyDVi-89c6zjvpBvG4IIHvAzAXdWAYm8w18',
  authDomain: 'route-lab-f50dc.firebaseapp.com',
  projectId: 'route-lab-f50dc',
  storageBucket: 'route-lab-f50dc.firebasestorage.app',
  messagingSenderId: '438221186982',
  appId: '1:438221186982:web:a15d65c49b3b1d3c265167',
} as const;
// Note: no measurementId and no Analytics — RouteLab does not use Analytics.
