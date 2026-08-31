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

// Use default database (removes AI shared quota bottleneck)
export const db = getFirestore(app);

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
