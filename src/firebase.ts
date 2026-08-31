import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  resolvedFirebaseConfig,
  resolvedFirestoreDatabaseId,
  app,
  db,
  auth,
  CloudSync,
  seedCoreCollectionsIfEmpty
} from './services/firebase';

export {
  firebaseConfig,
  resolvedFirebaseConfig,
  resolvedFirestoreDatabaseId,
  app,
  db,
  auth,
  CloudSync,
  seedCoreCollectionsIfEmpty
};

export default db;
