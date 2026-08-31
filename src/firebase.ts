import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import {
  resolvedFirebaseConfig,
  resolvedFirestoreDatabaseId,
  app,
  auth,
  CloudSync,
  seedCoreCollectionsIfEmpty
} from './services/firebase';

// Connect explicitly to the active named instance
export const db = getFirestore(app, "ai-studio-secondmedicvialt-672ab7fa-5c2a-4a7b-9439-899ee4ab7829");

export {
  firebaseConfig,
  resolvedFirebaseConfig,
  resolvedFirestoreDatabaseId,
  app,
  auth,
  CloudSync,
  seedCoreCollectionsIfEmpty
};

export default db;
