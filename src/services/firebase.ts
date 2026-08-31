import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  writeBatch,
  getDocFromServer,
  GeoPoint,
  Unsubscribe,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  UserCredential
} from 'firebase/auth';
import { UserRole, LocationPing, PickupBoy, PickupTask, Client, AttendanceRecord, Route } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

/**
 * Safely resolves an environment variable across Vite browser (import.meta.env)
 * and Node/runtime (process.env) contexts without throwing ReferenceErrors.
 */
function getEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    try {
      const metaEnv = (import.meta as any)?.env;
      if (metaEnv && metaEnv[key]) {
        return metaEnv[key];
      }
    } catch {
      // Ignore reference errors
    }
    try {
      const procEnv = (globalThis as any)?.process?.env || (typeof process !== 'undefined' ? process.env : undefined);
      if (procEnv && procEnv[key]) {
        return procEnv[key];
      }
    } catch {
      // Ignore reference errors
    }
  }
  return undefined;
}

// Fallback configuration object from configuration file (if present)
const fallbackConfig = (firebaseConfig as Record<string, any>) || {};

/**
 * Resolved Firebase client configuration sourced dynamically from environment variables
 * (import.meta.env / process.env) with non-hardcoded fallbacks.
 */
export const resolvedFirebaseConfig = {
  apiKey:
    getEnv(['VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY', 'VITE_API_KEY', 'API_KEY']) ||
    fallbackConfig.apiKey ||
    '',
  authDomain:
    getEnv(['VITE_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN', 'VITE_AUTH_DOMAIN', 'AUTH_DOMAIN']) ||
    fallbackConfig.authDomain ||
    '',
  projectId:
    getEnv(['VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID', 'VITE_PROJECT_ID', 'PROJECT_ID']) ||
    fallbackConfig.projectId ||
    '',
  storageBucket:
    getEnv(['VITE_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET', 'VITE_STORAGE_BUCKET', 'STORAGE_BUCKET']) ||
    fallbackConfig.storageBucket ||
    '',
  messagingSenderId:
    getEnv(['VITE_FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_MESSAGING_SENDER_ID', 'VITE_MESSAGING_SENDER_ID', 'MESSAGING_SENDER_ID']) ||
    fallbackConfig.messagingSenderId ||
    '',
  appId:
    getEnv(['VITE_FIREBASE_APP_ID', 'FIREBASE_APP_ID', 'VITE_APP_ID', 'APP_ID']) ||
    fallbackConfig.appId ||
    '',
  measurementId:
    getEnv(['VITE_FIREBASE_MEASUREMENT_ID', 'FIREBASE_MEASUREMENT_ID', 'VITE_MEASUREMENT_ID']) ||
    fallbackConfig.measurementId ||
    '',
};

export const resolvedFirestoreDatabaseId: string | undefined =
  getEnv([
    'VITE_FIREBASE_DATABASE_ID',
    'FIREBASE_DATABASE_ID',
    'VITE_FIREBASE_FIRESTORE_DATABASE_ID',
    'FIREBASE_FIRESTORE_DATABASE_ID',
    'VITE_FIRESTORE_DATABASE_ID'
  ]) || fallbackConfig.firestoreDatabaseId;

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(resolvedFirebaseConfig) : getApp();

// Initialize Firestore using the specific provisioned database ID or default
export const db = resolvedFirestoreDatabaseId ? getFirestore(app, resolvedFirestoreDatabaseId) : getFirestore(app);
export const auth = getAuth(app);

export { GeoPoint };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Error Context: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Initial connection test
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firebase] Connection to Firestore verified successfully.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Please check your Firebase configuration or network status.');
    }
  }
}
testConnection();

/**
 * Utility to extract latitude and longitude from various Firestore GeoPoint representations.
 */
export function parseFirestoreGeoPoint(point: any): { lat: number; lng: number } | null {
  if (!point) return null;
  // Standard Firestore GeoPoint instance has .latitude and .longitude
  if (typeof point.latitude === 'number' && typeof point.longitude === 'number') {
    return { lat: point.latitude, lng: point.longitude };
  }
  // Standard lat/lng object
  if (typeof point.lat === 'number' && typeof point.lng === 'number') {
    return { lat: point.lat, lng: point.lng };
  }
  // Firestore internal _lat, _long
  if (typeof point._lat === 'number' && typeof point._long === 'number') {
    return { lat: point._lat, lng: point._long };
  }
  // [lat, lng] array
  if (Array.isArray(point) && point.length >= 2 && typeof point[0] === 'number' && typeof point[1] === 'number') {
    return { lat: point[0], lng: point[1] };
  }
  return null;
}

/**
 * Converts lat/lng coordinates to a native Firestore GeoPoint instance.
 */
export function toFirestoreGeoPoint(lat: number, lng: number): GeoPoint {
  return new GeoPoint(lat, lng);
}

// Operational Accounts Configuration with Matching Roles and Doc IDs
export const OPERATIONAL_ACCOUNTS = {
  admin: {
    email: 'admin@secondmedic.com',
    password: 'SecondMedicOps@2026',
    role: 'admin' as const,
    displayName: 'SecondMedic Logistics Lead',
    claims: { role: 'admin' }
  },
  client: {
    email: 'client.ops@secondmedic.com',
    password: 'SecondMedicOps@2026',
    role: 'client' as const,
    clientId: 'client-bkc-metropolis',
    displayName: 'Metropolis Healthcare (Lab Ops)',
    claims: { role: 'client', clientId: 'client-bkc-metropolis' }
  },
  rider: {
    email: 'rahul.rider@secondmedic.com',
    password: 'SecondMedicOps@2026',
    role: 'rider' as const,
    riderId: 'rider-rahul',
    displayName: 'Rahul Sharma (Courier)',
    claims: { role: 'rider', riderId: 'rider-rahul' }
  }
};

export const DEMO_ACCOUNTS = OPERATIONAL_ACCOUNTS;

/**
 * Ensures standard operational test accounts are provisioned in Firebase Auth
 * so valid credentials authenticate strictly via signInWithEmailAndPassword.
 */
export async function seedOperationalAuthAccounts(): Promise<void> {
  const accounts = Object.values(OPERATIONAL_ACCOUNTS);
  for (const acc of accounts) {
    try {
      await createUserWithEmailAndPassword(auth, acc.email, acc.password);
      console.log(`[FirebaseAuth] Initialized operational account: ${acc.email}`);
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        // Account exists
      } else {
        // Non-blocking log
      }
    }
  }
}

// Auto-seed operational accounts at startup
seedOperationalAuthAccounts().catch(() => {});

export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged };

// Realtime Firestore synchronization helpers
export const CloudSync = {
  // Sync a single document to Firestore
  async syncDocument(collectionName: string, docId: string, data: any) {
    try {
      if (!docId || !collectionName) return;
      const ref = doc(db, collectionName, String(docId));
      await setDoc(ref, JSON.parse(JSON.stringify(data)), { merge: true });
      console.log(`[CloudSync] Synced ${collectionName}/${docId} to Firestore.`);
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        console.info(`[CloudSync] Firestore ${collectionName}/${docId} write check: ${err.message}`);
      } else {
        console.warn(`[CloudSync] Sync notice for ${collectionName}/${docId}:`, err?.message || err);
      }
    }
  },

  // Delete a document from Firestore
  async deleteDocument(collectionName: string, docId: string) {
    try {
      if (!docId || !collectionName) return;
      const ref = doc(db, collectionName, String(docId));
      await deleteDoc(ref);
      console.log(`[CloudSync] Deleted ${collectionName}/${docId} from Firestore.`);
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        console.info(`[CloudSync] Firestore ${collectionName}/${docId} delete check: ${err.message}`);
      } else {
        console.warn(`[CloudSync] Delete notice for ${collectionName}/${docId}:`, err?.message || err);
      }
    }
  },

  // Sync an entire collection of items to Firestore
  async syncCollection(collectionName: string, items: any[]) {
    try {
      if (!items || !items.length) return;
      const batch = writeBatch(db);
      for (const item of items) {
        if (item.id) {
          const ref = doc(db, collectionName, String(item.id));
          batch.set(ref, JSON.parse(JSON.stringify(item)), { merge: true });
        }
      }
      await batch.commit();
      console.log(`[CloudSync] Batch synced ${items.length} items to ${collectionName}.`);
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        console.info(`[CloudSync] Firestore batch sync for ${collectionName}: ${err.message}`);
      } else {
        console.warn(`[CloudSync] Batch sync notice for ${collectionName}:`, err?.message || err);
      }
    }
  },

  // Record a live location ping in Firestore 'locations' and update the rider's GeoPoint in 'riders'
  async recordLocationPing(ping: LocationPing) {
    try {
      const geoPoint = toFirestoreGeoPoint(ping.lat, ping.lng);
      
      // 1. Write to 'locations' collection with native GeoPoint
      const locationDocRef = doc(db, 'locations', ping.id);
      await setDoc(locationDocRef, {
        id: ping.id,
        riderId: ping.riderId,
        riderName: ping.riderName,
        timestamp: ping.timestamp,
        lat: ping.lat,
        lng: ping.lng,
        location: geoPoint,
        speed: ping.speed ?? 0,
        heading: ping.heading ?? 0,
        battery: ping.battery ?? 100,
        taskId: ping.taskId || null,
        lastUpdated: serverTimestamp()
      }, { merge: true });

      // 2. Update rider document in 'riders' collection with current GeoPoint and serverTimestamp
      if (ping.riderId) {
        const riderDocRef = doc(db, 'riders', ping.riderId);
        await setDoc(riderDocRef, {
          id: ping.riderId,
          lastPingTime: ping.timestamp,
          lastUpdated: serverTimestamp(),
          isOnline: true,
          batteryLevel: ping.battery ?? 100,
          heading: ping.heading ?? 0,
          currentLocation: {
            lat: ping.lat,
            lng: ping.lng,
            location: geoPoint,
            timestamp: ping.timestamp,
            heading: ping.heading ?? 0,
            speed: ping.speed ?? 0,
            accuracy: 5
          }
        }, { merge: true });
      }
    } catch (err: any) {
      console.warn('[CloudSync] Location ping sync notice:', err?.message || err);
    }
  },

  // Update rider GPS location with serverTimestamp and online flag
  async updateRiderGpsLocation(riderId: string, lat: number, lng: number, heading: number = 0, speed: number = 0, battery: number = 90, taskId?: string) {
    try {
      const geoPoint = toFirestoreGeoPoint(lat, lng);
      const pingId = `ping-${Date.now()}`;
      const nowIso = new Date().toISOString();

      // Update rider document directly
      const riderDocRef = doc(db, 'riders', riderId);
      await setDoc(riderDocRef, {
        id: riderId,
        lastPingTime: nowIso,
        lastUpdated: serverTimestamp(),
        isOnline: true,
        batteryLevel: battery,
        heading: heading || 0,
        currentLocation: {
          lat,
          lng,
          location: geoPoint,
          timestamp: nowIso,
          heading: heading || 0,
          speed: speed || 0,
          accuracy: 5
        }
      }, { merge: true });

      // Also record in locations collection
      const locationDocRef = doc(db, 'locations', pingId);
      await setDoc(locationDocRef, {
        id: pingId,
        riderId,
        timestamp: nowIso,
        lat,
        lng,
        location: geoPoint,
        speed: speed || 0,
        heading: heading || 0,
        battery: battery || 90,
        taskId: taskId || null,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } catch (err: any) {
      console.warn('[CloudSync] updateRiderGpsLocation notice:', err?.message || err);
    }
  },

  // Subscribe to real-time updates for a collection
  subscribeToCollection<T>(collectionName: string, onUpdate: (items: T[]) => void): Unsubscribe {
    try {
      const colRef = collection(db, collectionName);
      const unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const list: T[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              // Parse GeoPoint fields if present
              if (data.location instanceof GeoPoint) {
                data.lat = data.location.latitude;
                data.lng = data.location.longitude;
              } else if (data.currentLocation?.location instanceof GeoPoint) {
                data.currentLocation.lat = data.currentLocation.location.latitude;
                data.currentLocation.lng = data.currentLocation.location.longitude;
              }
              list.push(data as T);
            });
            onUpdate(list);
          }
        },
        (error: any) => {
          if (error?.code === 'permission-denied') {
            console.info(`[CloudSync] Real-time listener on ${collectionName}: ${error.message}`);
          } else {
            console.warn(`[CloudSync] Real-time listener notice for ${collectionName}:`, error?.message || error);
          }
        }
      );
      return unsubscribe;
    } catch (err) {
      return () => {};
    }
  },

  // Dedicated real-time snapshot subscription for 'locations' collection
  subscribeToLocations(onUpdate: (pings: LocationPing[]) => void): Unsubscribe {
    return this.subscribeToCollection('locations', (items: any[]) => {
      const formatted = items.map((item: any) => {
        const coords = parseFirestoreGeoPoint(item.location) || { lat: item.lat, lng: item.lng };
        return {
          ...item,
          lat: coords.lat,
          lng: coords.lng
        } as LocationPing;
      });
      onUpdate(formatted);
    });
  },

  // Dedicated real-time snapshot subscription for 'riders' collection
  subscribeToRiders(onUpdate: (riders: PickupBoy[]) => void): Unsubscribe {
    return this.subscribeToCollection('riders', (items: any[]) => {
      const formatted = items.map((r: any) => {
        if (r.currentLocation) {
          const coords = parseFirestoreGeoPoint(r.currentLocation.location) || {
            lat: r.currentLocation.lat,
            lng: r.currentLocation.lng
          };
          return {
            ...r,
            currentLocation: {
              ...r.currentLocation,
              lat: coords.lat,
              lng: coords.lng
            }
          };
        }
        return r;
      }) as PickupBoy[];
      onUpdate(formatted);
    });
  },

  // Dedicated real-time snapshot subscription for 'tasks' collection
  subscribeToTasks(onUpdate: (tasks: PickupTask[]) => void): Unsubscribe {
    return this.subscribeToCollection('tasks', (items: any[]) => {
      const formatted = items.map((t: any) => {
        if (t.pickupGeoPoint) {
          const coords = parseFirestoreGeoPoint(t.pickupGeoPoint);
          if (coords) {
            t.pickupLocation = {
              ...(t.pickupLocation || {}),
              lat: coords.lat,
              lng: coords.lng
            };
          }
        }
        if (t.deliveryGeoPoint) {
          const coords = parseFirestoreGeoPoint(t.deliveryGeoPoint);
          if (coords) {
            t.deliveryLocation = {
              ...(t.deliveryLocation || {}),
              lat: coords.lat,
              lng: coords.lng
            };
          }
        }
        return t;
      }) as PickupTask[];
      onUpdate(formatted);
    });
  },

  // Dedicated real-time snapshot subscription for 'clients' collection
  subscribeToClients(onUpdate: (clients: Client[]) => void): Unsubscribe {
    return this.subscribeToCollection('clients', (items: any[]) => {
      const formatted = items.map((c: any) => {
        if (c.location) {
          const coords = parseFirestoreGeoPoint(c.location);
          if (coords) {
            c.lat = coords.lat;
            c.lng = coords.lng;
          }
        }
        return c;
      }) as Client[];
      onUpdate(formatted);
    });
  },

  // Dedicated real-time snapshot subscription for 'attendance' collection
  subscribeToAttendance(onUpdate: (records: AttendanceRecord[]) => void): Unsubscribe {
    return this.subscribeToCollection('attendance', (items: any[]) => {
      const formatted = items.map((a: any) => {
        if (a.checkInLocation?.location) {
          const coords = parseFirestoreGeoPoint(a.checkInLocation.location);
          if (coords) {
            a.checkInLocation.lat = coords.lat;
            a.checkInLocation.lng = coords.lng;
          }
        }
        return a;
      }) as AttendanceRecord[];
      onUpdate(formatted);
    });
  },

  // Dedicated real-time snapshot subscription for 'routes' collection
  subscribeToRoutes(onUpdate: (routes: Route[]) => void): Unsubscribe {
    return this.subscribeToCollection('routes', (items: any[]) => {
      const formatted = items.map((r: any) => {
        if (r.destinationLab) {
          const coords = parseFirestoreGeoPoint(r.destinationLab.location) || {
            lat: r.destinationLab.lat,
            lng: r.destinationLab.lng
          };
          r.destinationLab.lat = coords.lat;
          r.destinationLab.lng = coords.lng;
        }
        if (Array.isArray(r.stops)) {
          r.stops = r.stops.map((s: any) => {
            const coords = parseFirestoreGeoPoint(s.location) || { lat: s.lat, lng: s.lng };
            return {
              ...s,
              lat: coords.lat,
              lng: coords.lng
            };
          });
        }
        return r as Route;
      });
      onUpdate(formatted);
    });
  },

  // Scoped Firestore query subscription: Client Tasks (strictly filtered to session.clientId)
  subscribeToClientTasks(clientId: string, onUpdate: (tasks: PickupTask[]) => void): Unsubscribe {
    if (!clientId) return () => {};
    try {
      const q = query(collection(db, 'tasks'), where('clientId', '==', clientId));
      return onSnapshot(
        q,
        (snapshot) => {
          const list: PickupTask[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            if (data.pickupGeoPoint) {
              const coords = parseFirestoreGeoPoint(data.pickupGeoPoint);
              if (coords) {
                data.pickupLocation = { ...(data.pickupLocation || {}), lat: coords.lat, lng: coords.lng };
              }
            }
            if (data.deliveryGeoPoint) {
              const coords = parseFirestoreGeoPoint(data.deliveryGeoPoint);
              if (coords) {
                data.deliveryLocation = { ...(data.deliveryLocation || {}), lat: coords.lat, lng: coords.lng };
              }
            }
            if (data.clientId === clientId) {
              list.push(data as PickupTask);
            }
          });
          onUpdate(list);
        },
        (err) => {
          console.warn(`[CloudSync] Client tasks subscription notice for ${clientId}:`, err?.message || err);
          // Fallback to local storage tasks filtered by clientId
        }
      );
    } catch (e) {
      console.warn('[CloudSync] subscribeToClientTasks init exception:', e);
      return () => {};
    }
  },

  // Scoped Firestore query subscription: Client Routes (strictly filtered to session.clientId)
  subscribeToClientRoutes(clientId: string, onUpdate: (routes: Route[]) => void): Unsubscribe {
    if (!clientId) return () => {};
    try {
      const q = query(collection(db, 'routes'), where('clientId', '==', clientId));
      return onSnapshot(
        q,
        (snapshot) => {
          const list: Route[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            if (data.destinationLab) {
              const coords = parseFirestoreGeoPoint(data.destinationLab.location) || {
                lat: data.destinationLab.lat,
                lng: data.destinationLab.lng
              };
              data.destinationLab.lat = coords.lat;
              data.destinationLab.lng = coords.lng;
            }
            if (Array.isArray(data.stops)) {
              data.stops = data.stops.map((s: any) => {
                const coords = parseFirestoreGeoPoint(s.location) || { lat: s.lat, lng: s.lng };
                return { ...s, lat: coords.lat, lng: coords.lng };
              });
            }
            if (data.clientId === clientId) {
              list.push(data as Route);
            }
          });
          onUpdate(list);
        },
        (err) => {
          console.warn(`[CloudSync] Client routes subscription notice for ${clientId}:`, err?.message || err);
        }
      );
    } catch (e) {
      console.warn('[CloudSync] subscribeToClientRoutes init exception:', e);
      return () => {};
    }
  },

  // Scoped Firestore query subscription: Rider Tasks (strictly filtered to active rider identity)
  subscribeToRiderTasks(riderId: string, riderPhone?: string, onUpdate?: (tasks: PickupTask[]) => void): Unsubscribe {
    if (!riderId || !onUpdate) return () => {};
    try {
      const q = query(collection(db, 'tasks'), where('riderId', '==', riderId));
      const cleanPhone = (riderPhone || '').replace(/\D/g, '');
      return onSnapshot(
        q,
        (snapshot) => {
          const list: PickupTask[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const tPhone = (data.riderPhone || '').replace(/\D/g, '');
            if (data.riderId === riderId || data.assignedRiderId === riderId || (cleanPhone && tPhone === cleanPhone)) {
              list.push(data as PickupTask);
            }
          });
          onUpdate(list);
        },
        (err) => {
          console.warn(`[CloudSync] Rider tasks subscription notice for ${riderId}:`, err?.message || err);
        }
      );
    } catch (e) {
      console.warn('[CloudSync] subscribeToRiderTasks init exception:', e);
      return () => {};
    }
  },

  // Scoped Firestore query subscription: Rider Assigned Routes
  subscribeToRiderRoutes(riderId: string, riderPhone?: string, onUpdate?: (routes: Route[]) => void): Unsubscribe {
    if (!riderId || !onUpdate) return () => {};
    try {
      const q = query(collection(db, 'routes'), where('assignedRiderId', '==', riderId));
      const cleanPhone = (riderPhone || '').replace(/\D/g, '');
      return onSnapshot(
        q,
        (snapshot) => {
          const list: Route[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const rPhone = (data.assignedRiderPhone || '').replace(/\D/g, '');
            if (data.assignedRiderId === riderId || (cleanPhone && rPhone === cleanPhone)) {
              list.push(data as Route);
            }
          });
          onUpdate(list);
        },
        (err) => {
          console.warn(`[CloudSync] Rider routes subscription notice for ${riderId}:`, err?.message || err);
        }
      );
    } catch (e) {
      console.warn('[CloudSync] subscribeToRiderRoutes init exception:', e);
      return () => {};
    }
  },

  // Scoped Firestore document subscription: Active Rider Document
  subscribeToRiderDocument(riderId: string, onUpdate: (rider: PickupBoy | null) => void): Unsubscribe {
    if (!riderId) return () => {};
    try {
      const ref = doc(db, 'riders', riderId);
      return onSnapshot(
        ref,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as any;
            if (data.currentLocation) {
              const coords = parseFirestoreGeoPoint(data.currentLocation.location) || {
                lat: data.currentLocation.lat,
                lng: data.currentLocation.lng
              };
              data.currentLocation.lat = coords.lat;
              data.currentLocation.lng = coords.lng;
            }
            onUpdate(data as PickupBoy);
          } else {
            onUpdate(null);
          }
        },
        (err) => {
          console.warn(`[CloudSync] Rider document subscription notice for ${riderId}:`, err?.message || err);
        }
      );
    } catch (e) {
      console.warn('[CloudSync] subscribeToRiderDocument init exception:', e);
      return () => {};
    }
  }
};
