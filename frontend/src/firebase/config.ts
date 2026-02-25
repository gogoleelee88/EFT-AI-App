console.log("VITE_FIREBASE_API_KEY exists?", !!import.meta.env.VITE_FIREBASE_API_KEY);
console.log("VITE_FIREBASE_API_KEY head:", (import.meta.env.VITE_FIREBASE_API_KEY || "").slice(0, 6));

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const rawFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isMissingEnvValue = (value: string | undefined): boolean => {
  if (!value) return true;
  const trimmed = value.trim();
  return (
    trimmed.length === 0 ||
    /^<\s*set_me\s*>$/i.test(trimmed) ||
    trimmed === 'your_api_key' ||
    trimmed === 'your-prod-firebase-api-key' ||   // ✅ 추가
    trimmed === 'your_project_id' ||
    trimmed === 'your_project_id.firebaseapp.com' ||
    trimmed === 'your_project_id.appspot.com' ||
    trimmed === 'your_messaging_sender_id' ||
    trimmed === 'your_app_id'
  );
};

const invalidEntries = Object.entries(rawFirebaseConfig).filter(([, value]) =>
  isMissingEnvValue(value),
);

if (invalidEntries.length > 0) {
  const keys = invalidEntries.map(([key]) => key).join(', ');
  throw new Error(
    `[Firebase Config] Invalid or missing values for ${keys}. Check frontend/.env.development (or .env/.env.local/.env.production.*) and set real VITE_FIREBASE_* values.`,
  );
}

const firebaseConfig = {
  apiKey: rawFirebaseConfig.apiKey as string,
  authDomain: rawFirebaseConfig.authDomain as string,
  projectId: rawFirebaseConfig.projectId as string,
  storageBucket: rawFirebaseConfig.storageBucket as string,
  messagingSenderId: rawFirebaseConfig.messagingSenderId as string,
  appId: rawFirebaseConfig.appId as string,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
