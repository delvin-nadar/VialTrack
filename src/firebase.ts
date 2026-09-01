import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import {
  resolvedFirebaseConfig,
  resolvedFirestoreDatabaseId,
  CloudSync,
  seedCoreCollectionsIfEmpty,
  cleanupFirestoreCollections
} from './services/firebase';

const app = !getApps().length ? initializeApp(firebaseConfig || resolvedFirebaseConfig) : getApp();
export const db = getFirestore(app, "ai-studio-secondmedicvialt-672ab7fa-5c2a-4a7b-9439-899ee4ab7829");
export const auth = getAuth(app);

export {
  firebaseConfig,
  resolvedFirebaseConfig,
  resolvedFirestoreDatabaseId,
  app,
  CloudSync,
  seedCoreCollectionsIfEmpty,
  cleanupFirestoreCollections
};

export default db;
