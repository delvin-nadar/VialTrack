import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
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

export const resolvedFirestoreDatabaseId: string =
  getEnv([
    'VITE_FIREBASE_DATABASE_ID',
    'FIREBASE_DATABASE_ID',
    'VITE_FIREBASE_FIRESTORE_DATABASE_ID',
    'FIREBASE_FIRESTORE_DATABASE_ID',
    'VITE_FIRESTORE_DATABASE_ID'
  ]) || fallbackConfig.firestoreDatabaseId || 'ai-studio-secondmedicvialt-672ab7fa-5c2a-4a7b-9439-899ee4ab7829';

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(resolvedFirebaseConfig) : getApp();

// Connect explicitly to the active named instance
export const db = getFirestore(app, "ai-studio-secondmedicvialt-672ab7fa-5c2a-4a7b-9439-899ee4ab7829");
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

// Throttle cache for trip and rider cloud location writes
const locationWriteThrottleMap = new Map<string, { timestamp: number; lat: number; lng: number }>();

/**
 * Strict Production Mode:
 * No demo accounts or mock seeders. Database starts pure and empty.
 */
export async function cleanupFirestoreCollections(): Promise<{ success: boolean; deletedCount: number; message: string }> {
  const collectionsToClean = ['clients', 'locations', 'riders', 'routes', 'tasks', 'trips', 'attendance', 'pings'];
  let totalDeleted = 0;
  for (const colName of collectionsToClean) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => {
          batch.delete(d.ref);
          totalDeleted++;
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn(`[FirestoreCleanup] Error clearing collection ${colName}:`, e);
    }
  }

  // Clear local storage cache
  try {
    const keysToPurge = [
      'smvt_clients', 'smvt_riders', 'smvt_routes', 'smvt_tasks',
      'smvt_attendance', 'smvt_pings', 'smvt_locations',
      'vialtrack_mock_fleet', 'vialtrack_demo_tasks', 'vialtrack_mock_riders',
      'vialtrack_mock_tasks', 'vialtrack_demo_rounds', 'vialtrack_initial_feed'
    ];
    keysToPurge.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Could not clear local storage during cleanup:', err);
  }

  return { success: true, deletedCount: totalDeleted, message: `Cleaned ${totalDeleted} documents across collections.` };
}

/**
 * Strict production mode: returns pure empty state
 */
export async function seedCoreCollectionsIfEmpty(): Promise<{ clientsSeeded: boolean; ridersSeeded: boolean }> {
  return { clientsSeeded: false, ridersSeeded: false };
}

export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged };

// Helper to normalize and unify tasks and trips across Admin, Rider, and Client schemas
export function formatUnifiedTask(id: string, data: any): PickupTask {
  const clientLabId = data.clientLabId || data.clientId || '';
  const clientLabName = data.clientLabName || data.clientName || 'Diagnostic Facility';

  const clientLat = Array.isArray(data.clientCoords) && data.clientCoords.length === 2
    ? Number(data.clientCoords[0])
    : Number(data.clientLabLocation?.lat || data.destination?.lat || data.deliveryLocation?.lat || 19.1287852);

  const clientLng = Array.isArray(data.clientCoords) && data.clientCoords.length === 2
    ? Number(data.clientCoords[1])
    : Number(data.clientLabLocation?.lng || data.destination?.lng || data.deliveryLocation?.lng || 72.8294183);

  const clientLocation = { lat: clientLat, lng: clientLng };

  const rawStops = Array.isArray(data.stops) && data.stops.length > 0
    ? data.stops
    : (Array.isArray(data.stopsProgress) ? data.stopsProgress : []);

  const unifiedStops = rawStops.map((s: any, idx: number) => {
    const sLat = Array.isArray(s.coords) && s.coords.length === 2
      ? Number(s.coords[0])
      : Number(s.lat || 19.1287852);
    const sLng = Array.isArray(s.coords) && s.coords.length === 2
      ? Number(s.coords[1])
      : Number(s.lng || 72.8294183);

    return {
      stopName: s.stopName || s.name || `Collection Stop ${idx + 1}`,
      address: s.address || 'Diagnostic Collection Point',
      lat: sLat,
      lng: sLng,
      specimenCount: Number(s.specimenCount ?? s.sampleCount ?? 0),
      sampleCount: Number(s.specimenCount ?? s.sampleCount ?? 0),
      status: s.status || 'pending',
      id: s.id || s.stopId || `stop-${idx + 1}`,
      contactPerson: s.contactPerson || 'Point of Contact',
      phone: s.phone || ''
    };
  });

  const stopsProgress: any[] = unifiedStops.map((s: any, idx: number) => ({
    stopId: s.id || `stop-${idx + 1}`,
    stopName: s.stopName,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    contactPerson: s.contactPerson || 'Point of Contact',
    phone: s.phone || '',
    status: s.status === 'picked_up' || s.status === 'completed' || s.status === 'arrived' || s.status === 'no_sample'
      ? (s.status === 'completed' ? 'picked_up' : s.status)
      : (s.status === 'in_progress' ? 'arrived' : 'pending'),
    sampleCount: s.specimenCount,
    notes: s.notes || ''
  }));

  const scheduledDate = data.scheduledDate || data.date || new Date().toISOString().split('T')[0];

  return {
    id: id || data.id,
    clientLabId,
    clientLabName,
    clientLabLocation: clientLocation,
    riderId: data.riderId || data.assignedRiderId || '',
    riderName: data.riderName || data.assignedRiderName || '',
    riderPhone: data.riderPhone || data.assignedRiderPhone || '',
    stops: unifiedStops,
    scheduledDate,
    date: scheduledDate,
    timeSlot: data.timeSlot || '09:00',
    routeId: data.routeId || `route-${clientLabId || 'direct'}`,
    routeName: data.routeName || `${clientLabName} Route`,
    clientId: clientLabId,
    clientName: clientLabName,
    riderVehicle: data.riderVehicle || data.vehicleNumber || '',
    status: data.status || 'assigned',
    activeRiderId: data.activeRiderId || data.riderId,
    activeRiderName: data.activeRiderName || data.riderName,
    currentDestinationStop: data.currentDestinationStop || (stopsProgress[0]?.stopName),
    tripStartedAt: data.tripStartedAt,
    currentStopIndex: data.currentStopIndex || 0,
    stopsProgress,
    destination: data.destination || {
      name: clientLabName,
      address: data.deliveryLocation?.address || data.clientAddress || '',
      lat: clientLat,
      lng: clientLng,
      notes: data.taskNotes || data.destination?.notes || 'Specimen cold-chain transport'
    },
    isDelayed: Boolean(data.isDelayed),
    delayMinutes: data.delayMinutes || 0,
    issueFlags: data.issueFlags || [],
    createdAt: data.createdAt ? (typeof data.createdAt === 'object' ? new Date().toISOString() : data.createdAt) : new Date().toISOString(),
    startedAt: data.startedAt,
    completedAt: data.completedAt
  };
}

// Realtime Firestore synchronization helpers
export const CloudSync = {
  // Unified trip dispatch creating trip document in Firestore collection 'trips'
  async dispatchTrip(payload: {
    client: Client | { id: string; name: string; email?: string; lat?: number; lng?: number; address?: string };
    rider: PickupBoy | { id: string; name: string; phone: string; lat?: number; lng?: number; vehicleNumber?: string; currentLocation?: any };
    stops: Array<{ id?: string; stopId?: string; name?: string; stopName?: string; address?: string; lat?: number; lng?: number; specimenCount?: number; sampleCount?: number; status?: string; contactPerson?: string; phone?: string; notes?: string }>;
    route?: Partial<Route>;
    timeSlot?: string;
    scheduledDate?: string;
    taskNotes?: string;
    customTripId?: string;
  }): Promise<any> {
    const timestamp = Date.now();
    const tripId = payload.customTripId || `trip_${timestamp}`;
    const todayStr = payload.scheduledDate || new Date().toISOString().split('T')[0];

    const clientLat = Number(payload.client.lat || (payload.client as any).location?.lat || 19.1287852);
    const clientLng = Number(payload.client.lng || (payload.client as any).location?.lng || 72.8294183);

    const riderLat = Number(
      payload.rider.lat ||
      (payload.rider as any).currentLocation?.lat ||
      19.1287
    );
    const riderLng = Number(
      payload.rider.lng ||
      (payload.rider as any).currentLocation?.lng ||
      72.8294
    );

    // 1. Format unified trip stops schema
    const tripStops = payload.stops.map((s: any, idx: number) => ({
      stopIndex: idx + 1,
      name: s.name || s.stopName || `Stop ${idx + 1}`,
      address: s.address || 'Diagnostic Collection Point',
      coords: [Number(s.lat || 19.1287852), Number(s.lng || 72.8294183)] as [number, number],
      specimenCount: Number(s.specimenCount ?? s.sampleCount ?? 0),
      status: 'pending' as 'pending' | 'in_progress' | 'completed',
      id: s.id || s.stopId || `stop-${idx + 1}`,
      stopId: s.stopId || s.id || `stop-${idx + 1}`,
      contactPerson: s.contactPerson || 'Point of Contact',
      phone: s.phone || '',
      notes: s.notes || ''
    }));

    // Exact Unified Trip document model
    const tripDocPayload = {
      id: tripId,
      clientId: payload.client.id,
      clientName: payload.client.name,
      clientEmail: (payload.client as any).email || '',
      clientCoords: [clientLat, clientLng] as [number, number],
      riderId: payload.rider.id,
      riderName: payload.rider.name,
      riderPhone: payload.rider.phone,
      riderCoords: [riderLat, riderLng] as [number, number],
      stops: tripStops,
      currentStopIndex: 0,
      status: 'assigned' as 'assigned' | 'in_transit' | 'completed',
      chillerTemp: 4.2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Additional metadata for compatibility
      routeId: payload.route?.id || `route-${payload.client.id}`,
      routeName: payload.route?.name || `${payload.client.name} Collection Loop`,
      timeSlot: payload.timeSlot || '09:00',
      date: todayStr,
      riderVehicle: payload.rider.vehicleNumber || '',
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: []
    };

    try {
      // Write to 'trips' collection
      await setDoc(doc(db, 'trips', tripId), tripDocPayload);
      console.log(`[CloudSync] Dispatched trip document ${tripId} to trips collection.`);

      // Also mirror to 'tasks' collection for backward compatibility
      const legacyTaskPayload = {
        ...tripDocPayload,
        clientLabId: payload.client.id,
        clientLabName: payload.client.name,
        clientLabLocation: { lat: clientLat, lng: clientLng },
        assignedRiderId: payload.rider.id,
        assignedRiderName: payload.rider.name,
        assignedRiderPhone: payload.rider.phone,
        stopsProgress: tripStops.map((s) => ({
          stopId: s.id,
          stopName: s.name,
          address: s.address,
          lat: s.coords[0],
          lng: s.coords[1],
          contactPerson: s.contactPerson,
          phone: s.phone,
          status: 'pending',
          sampleCount: s.specimenCount,
          specimenCount: s.specimenCount,
          notes: s.notes
        })),
        destination: {
          name: payload.route?.destinationLab?.name || payload.client.name,
          address: payload.route?.destinationLab?.address || (payload.client as any).address || '',
          lat: clientLat,
          lng: clientLng,
          notes: payload.taskNotes || 'Specimen cold-chain transport'
        }
      };
      await setDoc(doc(db, 'tasks', tripId), legacyTaskPayload);

      // Update riders/${riderId} setting activeTripId = tripId and dutyStatus = "on_trip"
      const riderDocRef = doc(db, 'riders', payload.rider.id);
      await setDoc(
        riderDocRef,
        {
          id: payload.rider.id,
          activeTripId: tripId,
          dutyStatus: 'on_trip',
          currentTaskId: tripId,
          activeTaskId: tripId,
          activeRouteId: payload.route?.id || `route-${payload.client.id}`,
          lastDispatchedAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
          status: 'active',
          isOnline: true
        },
        { merge: true }
      );
      console.log(`[CloudSync] Updated riders/${payload.rider.id} activeTripId=${tripId}, dutyStatus="on_trip"`);
    } catch (err) {
      console.error("Firestore Write Error:", err);
    }

    return tripDocPayload;
  },

  // Standardized dispatchTask wrapper returning formatted PickupTask
  async dispatchTask(payload: {
    client: Client | { id: string; name: string; email?: string; lat?: number; lng?: number; address?: string };
    rider: PickupBoy | { id: string; name: string; phone: string; vehicleNumber?: string; lat?: number; lng?: number };
    stops: Array<{ id?: string; stopId?: string; name?: string; stopName?: string; address?: string; lat?: number; lng?: number; specimenCount?: number; sampleCount?: number; status?: string; assignedRiderId?: string; assignedRiderName?: string; contactPerson?: string; phone?: string; notes?: string }>;
    route?: Partial<Route>;
    timeSlot?: string;
    scheduledDate?: string;
    taskNotes?: string;
    customTaskId?: string;
  }): Promise<PickupTask> {
    const tripPayload = await this.dispatchTrip({
      ...payload,
      customTripId: payload.customTaskId
    });

    return formatUnifiedTask(tripPayload.id, {
      ...tripPayload,
      createdAt: new Date().toISOString()
    });
  },

  // Real-time trip lifecycle updates
  async startTripRoute(tripId: string, riderId?: string) {
    try {
      const tripRef = doc(db, 'trips', tripId);
      const updateData: any = {
        status: 'in_transit',
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(tripRef, updateData, { merge: true });

      // Also mirror to legacy tasks
      await setDoc(doc(db, 'tasks', tripId), {
        status: 'in_transit',
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (riderId) {
        await setDoc(doc(db, 'riders', riderId), {
          dutyStatus: 'on_trip',
          activeTripId: tripId,
          status: 'active',
          lastUpdated: serverTimestamp()
        }, { merge: true });
      }
      console.log(`[CloudSync] Started trip route for ${tripId}`);
    } catch (err) {
      console.error("Firestore Write Error:", err);
    }
  },

  async updateTripRiderLocation(
    tripId: string,
    riderId: string,
    lat: number,
    lng: number,
    extra?: { heading?: number; speed?: number; battery?: number; riderName?: string; riderPhone?: string }
  ) {
    try {
      const numLat = Number(lat);
      const numLng = Number(lng);
      if (isNaN(numLat) || isNaN(numLng)) return;

      const throttleKey = `${riderId || 'rider'}_${tripId || 'notrip'}`;
      const now = Date.now();
      const lastWrite = locationWriteThrottleMap.get(throttleKey);

      if (lastWrite && now - lastWrite.timestamp < 12000) {
        // Less than 12s has elapsed, skip redundant cloud write to conserve quota
        return;
      }
      locationWriteThrottleMap.set(throttleKey, { timestamp: now, lat: numLat, lng: numLng });

      // 1. Update trip document riderCoords and updatedAt
      if (tripId) {
        const tripRef = doc(db, 'trips', tripId);
        await setDoc(tripRef, {
          riderCoords: [numLat, numLng],
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 2. Update rider document location
      if (riderId) {
        const riderRef = doc(db, 'riders', riderId);
        await setDoc(riderRef, {
          lat: numLat,
          lng: numLng,
          currentLocation: {
            lat: numLat,
            lng: numLng,
            timestamp: new Date().toISOString(),
            heading: extra?.heading || 0,
            speed: extra?.speed || 0
          },
          lastPingTime: new Date().toISOString(),
          lastUpdated: serverTimestamp(),
          isOnline: true
        }, { merge: true });
      }
    } catch (err: any) {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
        console.warn('[CloudSync] Firestore rate limit or quota exceeded for location update.');
      } else {
        console.error("Firestore Write Error:", err);
      }
    }
  },

  async completeTripStop(tripId: string, stopIndex: number, currentStops: any[], extra?: any) {
    try {
      const updatedStops = currentStops.map((s, idx) => {
        if (idx === stopIndex) {
          return {
            ...s,
            status: 'completed',
            completedAt: new Date().toISOString(),
            specimenCount: extra?.sampleCount !== undefined ? Number(extra.sampleCount) : Number(s.specimenCount || 0),
            photoUrl: extra?.photoUrl || s.photoUrl || '',
            notes: extra?.notes || s.notes || ''
          };
        }
        if (idx === stopIndex + 1 && s.status === 'pending') {
          return { ...s, status: 'in_progress' };
        }
        return s;
      });

      const nextStopIndex = stopIndex + 1 < currentStops.length ? stopIndex + 1 : currentStops.length;

      const tripRef = doc(db, 'trips', tripId);
      await setDoc(tripRef, {
        stops: updatedStops,
        currentStopIndex: nextStopIndex,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Mirror to tasks
      await setDoc(doc(db, 'tasks', tripId), {
        currentStopIndex: nextStopIndex,
        stopsProgress: updatedStops.map(s => ({
          stopId: s.id || s.stopId,
          stopName: s.name,
          address: s.address,
          lat: s.coords?.[0] || s.lat,
          lng: s.coords?.[1] || s.lng,
          status: s.status === 'completed' ? 'picked_up' : s.status,
          sampleCount: s.specimenCount,
          notes: s.notes
        })),
        updatedAt: serverTimestamp()
      }, { merge: true });

      console.log(`[CloudSync] Completed stop ${stopIndex + 1} for trip ${tripId}`);
    } catch (err) {
      console.error("Firestore Write Error:", err);
    }
  },

  async completeTripFinalHandover(tripId: string, riderId: string, dropData?: any) {
    try {
      const tripRef = doc(db, 'trips', tripId);
      await setDoc(tripRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        finalDrop: dropData || null
      }, { merge: true });

      // Mirror to tasks
      await setDoc(doc(db, 'tasks', tripId), {
        status: 'completed',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (riderId) {
        await setDoc(doc(db, 'riders', riderId), {
          dutyStatus: 'available',
          activeTripId: '',
          currentTaskId: '',
          activeTaskId: '',
          lastUpdated: serverTimestamp()
        }, { merge: true });
      }

      console.log(`[CloudSync] Successfully completed final delivery handover for trip ${tripId}`);
    } catch (err) {
      console.error("Firestore Write Error:", err);
    }
  },

  // Sync a single document to Firestore
  async syncDocument(collectionName: string, docId: string, data: any) {
    try {
      if (!docId || !collectionName) return;
      const ref = doc(db, collectionName, String(docId));
      await setDoc(ref, JSON.parse(JSON.stringify(data)), { merge: true });
      console.log(`[CloudSync] Synced ${collectionName}/${docId} to Firestore.`);

      // When a route is assigned or saved, automatically create/update document in 'tasks'
      if (collectionName === 'routes' && data) {
        try {
          const taskId = `task_${data.id || Date.now()}`;
          const normalizedStops = Array.isArray(data.stops)
            ? data.stops.map((stop: any, index: number) => ({
                id: stop.id || `stop_${index + 1}`,
                name: stop.name || `Collection Stop ${index + 1}`,
                address: stop.address || 'Mumbai, Maharashtra',
                lat: Number(stop.lat || 19.1287852),
                lng: Number(stop.lng || 72.8294183),
                specimenCount: Number(stop.specimenCount || 0),
                status: index === 0 ? ('in_progress' as const) : ('pending' as const)
              }))
            : [];

          const taskDoc = {
            id: taskId,
            taskId: taskId,
            clientId: data.clientId || 'client-1788210054008',
            clientName: data.destinationLab?.name || data.name || 'Lifecare Diagnostics',
            clientEmail: data.destinationLab?.email || (data as any).clientEmail || '',
            routeId: data.id,
            routeName: data.name || 'Specimen Pickup Loop',
            riderId: data.assignedRiderId || '',
riderName: data.assignedRiderName || 'Unassigned',
riderPhone: data.assignedRiderPhone || '',
status: (data.assignedRiderId ? 'assigned' : 'pending') as 'assigned' | 'pending',
            currentStopIndex: 0,
            stops: normalizedStops,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          await setDoc(doc(db, 'tasks', taskId), taskDoc, { merge: true });
          console.log(`[CloudSync] Auto-instantiated tasks/${taskId} for route ${docId}`);
        } catch (tErr: any) {
          console.warn('[CloudSync] Auto-instantiate task on route save notice:', tErr?.message || tErr);
        }
      }
    } catch (err: any) {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
        console.warn(`[CloudSync] Firestore quota exceeded while syncing ${collectionName}/${docId}; cached locally.`);
      } else {
        console.error("Firestore Write Error:", err);
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
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
        console.warn(`[CloudSync] Firestore quota exceeded while deleting ${collectionName}/${docId}; handled locally.`);
      } else {
        console.error("Firestore Write Error:", err);
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
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
        console.warn(`[CloudSync] Firestore quota exceeded for batch sync to ${collectionName}; cached locally.`);
      } else {
        console.error("Firestore Write Error:", err);
      }
    }
  },

  // Update rider document directly in Firestore 'riders' with GeoPoint, battery, heading, speed, and serverTimestamp
  async recordLocationPing(ping: LocationPing) {
    try {
      if (!ping.riderId) return;
      const geoPoint = toFirestoreGeoPoint(ping.lat, ping.lng);
      const riderDocRef = doc(db, 'riders', ping.riderId);
      
      await setDoc(riderDocRef, {
        id: ping.riderId,
        lat: ping.lat,
        lng: ping.lng,
        heading: ping.heading ?? 0,
        speed: ping.speed ?? 0,
        battery: ping.battery ?? 88,
        batteryLevel: ping.battery ?? 88,
        lastPing: serverTimestamp(),
        lastPingTime: ping.timestamp || new Date().toISOString(),
        lastUpdated: serverTimestamp(),
        isOnline: true,
        status: 'active',
        currentLocation: {
          lat: ping.lat,
          lng: ping.lng,
          location: geoPoint,
          timestamp: ping.timestamp || new Date().toISOString(),
          heading: ping.heading ?? 0,
          speed: ping.speed ?? 0,
          accuracy: 5
        }
      }, { merge: true });
    } catch (err: any) {
      console.warn('[CloudSync] Location ping sync notice:', err?.message || err);
    }
  },

  // Update rider GPS location with serverTimestamp and online flag
  async updateRiderGpsLocation(riderId: string, lat: number, lng: number, heading: number = 0, speed: number = 0, battery: number = 90, taskId?: string) {
    try {
      const geoPoint = toFirestoreGeoPoint(lat, lng);
      const nowIso = new Date().toISOString();

      // Update rider document directly
      const riderDocRef = doc(db, 'riders', riderId);
      await setDoc(riderDocRef, {
        id: riderId,
        lat,
        lng,
        heading: heading || 0,
        speed: speed || 0,
        battery,
        batteryLevel: battery,
        lastPing: serverTimestamp(),
        lastPingTime: nowIso,
        lastUpdated: serverTimestamp(),
        isOnline: true,
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
    } catch (err: any) {
      console.warn('[CloudSync] updateRiderGpsLocation notice:', err?.message || err);
    }
  },

  // Subscribe to real-time updates for a collection with polling fallback on quota exhaustion
  subscribeToCollection<T>(collectionName: string, onUpdate: (items: T[]) => void): Unsubscribe {
    let isCancelled = false;
    let pollIntervalId: number | null = null;
    let unsubSnapshot: Unsubscribe = () => {};

    const fetchViaPolling = async () => {
      try {
        const colRef = collection(db, collectionName);
        const snapshot = await getDocs(colRef);
        if (isCancelled) return;
        if (snapshot.empty) {
          onUpdate([]);
        } else {
          const list: T[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
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
      } catch (pollErr: any) {
        console.warn(`[CloudSync] Polling fallback error for ${collectionName}:`, pollErr?.message || pollErr);
      }
    };

    const activatePollingFallback = (reason: string) => {
      console.warn(`[CloudSync] Real-time listener for ${collectionName} paused, switching to interval sync (15s):`, reason);
      fetchViaPolling();
      if (!pollIntervalId) {
        pollIntervalId = window.setInterval(fetchViaPolling, 15000);
      }
    };

    try {
      const colRef = collection(db, collectionName);
      unsubSnapshot = onSnapshot(
        colRef,
        {
          next: (snapshot) => {
            if (isCancelled) return;
            if (pollIntervalId) {
              clearInterval(pollIntervalId);
              pollIntervalId = null;
            }
            if (snapshot.empty) {
              onUpdate([]);
            } else {
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
          error: (error: any) => {
            if (isCancelled) return;
            const errMsg = error?.message || '';
            const errCode = error?.code || '';
            if (
              errCode === 'resource-exhausted' ||
              errMsg.toLowerCase().includes('quota') ||
              errMsg.toLowerCase().includes('resource_exhausted')
            ) {
              activatePollingFallback('Quota exceeded / Resource exhausted');
            } else if (error?.code === 'permission-denied') {
              console.info(`[CloudSync] Real-time listener on ${collectionName}: ${errMsg}`);
            } else {
              console.warn(`[CloudSync] Real-time listener notice for ${collectionName}:`, errMsg);
              activatePollingFallback(errMsg);
            }
          }
        }
      );
    } catch (err: any) {
      activatePollingFallback(err?.message || 'Listener initialization failed');
    }

    return () => {
      isCancelled = true;
      unsubSnapshot();
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    };
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

  // Scoped Firestore query subscription: Client Tasks (strictly filtered to session.clientId or clientName)
  subscribeToClientTasks(clientId: string, clientNameOrCb?: string | ((tasks: PickupTask[]) => void), maybeCb?: (tasks: PickupTask[]) => void): Unsubscribe {
    let clientName: string | undefined;
    let onUpdate: ((tasks: PickupTask[]) => void) | undefined;

    if (typeof clientNameOrCb === 'function') {
      onUpdate = clientNameOrCb;
      clientName = undefined;
    } else {
      clientName = clientNameOrCb;
      onUpdate = maybeCb;
    }

    if (!clientId && !clientName) return () => {};
    if (!onUpdate) return () => {};

    let isCancelled = false;
    let pollInterval: number | null = null;
    let unsubSnapshot: Unsubscribe = () => {};
    const cleanName = (clientName || '').trim().toLowerCase();

    const fetchTasksViaPolling = async () => {
      try {
        const snap = await getDocs(collection(db, 'tasks'));
        if (isCancelled) return;
        const list: PickupTask[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const dataName = (data.clientLabName || data.clientName || '').trim().toLowerCase();
          const isMatchClient =
            (clientId && (data.clientLabId === clientId || data.clientId === clientId)) ||
            (cleanName && dataName === cleanName);

          const isMatchingStatus = ['assigned', 'in_transit', 'started', 'at_stop', 'picked_up', 'upcoming', 'pending', 'completed', 'delivered'].includes(data.status);

          if (isMatchClient && isMatchingStatus) {
            const formatted = formatUnifiedTask(docSnap.id, data);
            list.push(formatted);
          }
        });
        onUpdate!(list);
      } catch (err: any) {
        console.warn('[CloudSync] Polling fallback for client tasks notice:', err?.message || err);
      }
    };

    const activateFallback = (reason: string) => {
      console.warn(`[CloudSync] Client tasks listener paused for ${clientId || clientName}, falling back to interval polling (15s):`, reason);
      fetchTasksViaPolling();
      if (!pollInterval) {
        pollInterval = window.setInterval(fetchTasksViaPolling, 15000);
      }
    };

    try {
      unsubSnapshot = onSnapshot(
        collection(db, 'tasks'),
        {
          next: (snapshot) => {
            if (isCancelled) return;
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
            const list: PickupTask[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data() as any;
              const dataName = (data.clientLabName || data.clientName || '').trim().toLowerCase();
              const isMatchClient =
                (clientId && (data.clientLabId === clientId || data.clientId === clientId)) ||
                (cleanName && dataName === cleanName);

              const isMatchingStatus = ['assigned', 'in_transit', 'started', 'at_stop', 'picked_up', 'upcoming', 'pending', 'completed', 'delivered'].includes(data.status);

              if (isMatchClient && isMatchingStatus) {
                const formatted = formatUnifiedTask(docSnap.id, data);
                list.push(formatted);
              }
            });
            onUpdate!(list);
          },
          error: (err) => {
            if (isCancelled) return;
            activateFallback(err?.message || 'Listener error');
          }
        }
      );
    } catch (e: any) {
      activateFallback(e?.message || 'Init error');
    }

    return () => {
      isCancelled = true;
      unsubSnapshot();
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  },

  // Scoped Firestore query subscription: Client Routes (strictly filtered to session.clientId)
  subscribeToClientRoutes(clientId: string, onUpdate: (routes: Route[]) => void): Unsubscribe {
    if (!clientId) return () => {};
    let isCancelled = false;
    let pollInterval: number | null = null;
    let unsubSnapshot: Unsubscribe = () => {};

    const fetchRoutesViaPolling = async () => {
      try {
        const q = query(collection(db, 'routes'), where('clientId', '==', clientId));
        const snapshot = await getDocs(q);
        if (isCancelled) return;
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
      } catch (err: any) {
        console.warn('[CloudSync] Polling fallback for client routes error:', err?.message || err);
      }
    };

    const activateFallback = (reason: string) => {
      console.warn(`[CloudSync] Client routes listener paused for ${clientId}, falling back to interval polling (15s):`, reason);
      fetchRoutesViaPolling();
      if (!pollInterval) {
        pollInterval = window.setInterval(fetchRoutesViaPolling, 15000);
      }
    };

    try {
      const q = query(collection(db, 'routes'), where('clientId', '==', clientId));
      unsubSnapshot = onSnapshot(
        q,
        {
          next: (snapshot) => {
            if (isCancelled) return;
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
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
          error: (err) => {
            if (isCancelled) return;
            activateFallback(err?.message || 'Listener error');
          }
        }
      );
    } catch (e: any) {
      activateFallback(e?.message || 'Init error');
    }

    return () => {
      isCancelled = true;
      unsubSnapshot();
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  },

  // Scoped Firestore query subscription: Rider Tasks (strictly filtered to active rider identity)
  subscribeToRiderTasks(riderId: string, riderPhone?: string, onUpdate?: (tasks: PickupTask[]) => void): Unsubscribe {
    if (!riderId || !onUpdate) return () => {};
    let isCancelled = false;
    let pollInterval: number | null = null;
    let unsubSnapshot: Unsubscribe = () => {};
    const cleanPhone = (riderPhone || '').replace(/\D/g, '');

    const fetchRiderTasksViaPolling = async () => {
      try {
        const snap = await getDocs(collection(db, 'tasks'));
        if (isCancelled) return;
        const list: PickupTask[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const tPhone = (data.riderPhone || '').replace(/\D/g, '');
          const isMatchRider =
            data.riderId === riderId ||
            data.assignedRiderId === riderId ||
            (cleanPhone && tPhone === cleanPhone) ||
            (riderPhone && data.riderPhone === riderPhone);

          const isMatchingStatus = ['assigned', 'in_transit', 'started', 'at_stop', 'picked_up', 'upcoming', 'pending', 'completed', 'delivered'].includes(data.status);

          if (isMatchRider && isMatchingStatus) {
            const formatted = formatUnifiedTask(docSnap.id, data);
            list.push(formatted);
          }
        });
        onUpdate(list);
      } catch (err: any) {
        console.warn('[CloudSync] Polling fallback for rider tasks error:', err?.message || err);
      }
    };

    const activateFallback = (reason: string) => {
      console.warn(`[CloudSync] Rider tasks listener paused for ${riderId}, falling back to interval polling (15s):`, reason);
      fetchRiderTasksViaPolling();
      if (!pollInterval) {
        pollInterval = window.setInterval(fetchRiderTasksViaPolling, 15000);
      }
    };

    try {
      unsubSnapshot = onSnapshot(
        collection(db, 'tasks'),
        {
          next: (snapshot) => {
            if (isCancelled) return;
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
            const list: PickupTask[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data() as any;
              const tPhone = (data.riderPhone || '').replace(/\D/g, '');
              const isMatchRider =
                data.riderId === riderId ||
                data.assignedRiderId === riderId ||
                (cleanPhone && tPhone === cleanPhone) ||
                (riderPhone && data.riderPhone === riderPhone);

              const isMatchingStatus = ['assigned', 'in_transit', 'started', 'at_stop', 'picked_up', 'upcoming', 'pending', 'completed', 'delivered'].includes(data.status);

              if (isMatchRider && isMatchingStatus) {
                const formatted = formatUnifiedTask(docSnap.id, data);
                list.push(formatted);
              }
            });
            onUpdate(list);
          },
          error: (err) => {
            if (isCancelled) return;
            activateFallback(err?.message || 'Listener error');
          }
        }
      );
    } catch (e: any) {
      activateFallback(e?.message || 'Init error');
    }

    return () => {
      isCancelled = true;
      unsubSnapshot();
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  },

  // Scoped Firestore query subscription: Rider Assigned Routes
  subscribeToRiderRoutes(riderId: string, riderPhone?: string, onUpdate?: (routes: Route[]) => void): Unsubscribe {
    if (!riderId || !onUpdate) return () => {};
    let isCancelled = false;
    let pollInterval: number | null = null;
    let unsubSnapshot: Unsubscribe = () => {};
    const cleanPhone = (riderPhone || '').replace(/\D/g, '');

    const fetchRiderRoutesViaPolling = async () => {
      try {
        const q = query(collection(db, 'routes'), where('assignedRiderId', '==', riderId));
        const snapshot = await getDocs(q);
        if (isCancelled) return;
        const list: Route[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const rPhone = (data.assignedRiderPhone || '').replace(/\D/g, '');
          if (data.assignedRiderId === riderId || (cleanPhone && rPhone === cleanPhone)) {
            list.push(data as Route);
          }
        });
        onUpdate(list);
      } catch (err: any) {
        console.warn('[CloudSync] Polling fallback for rider routes error:', err?.message || err);
      }
    };

    const activateFallback = (reason: string) => {
      console.warn(`[CloudSync] Rider routes listener paused for ${riderId}, falling back to interval polling (15s):`, reason);
      fetchRiderRoutesViaPolling();
      if (!pollInterval) {
        pollInterval = window.setInterval(fetchRiderRoutesViaPolling, 15000);
      }
    };

    try {
      const q = query(collection(db, 'routes'), where('assignedRiderId', '==', riderId));
      unsubSnapshot = onSnapshot(
        q,
        {
          next: (snapshot) => {
            if (isCancelled) return;
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
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
          error: (err) => {
            if (isCancelled) return;
            activateFallback(err?.message || 'Listener error');
          }
        }
      );
    } catch (e: any) {
      activateFallback(e?.message || 'Init error');
    }

    return () => {
      isCancelled = true;
      unsubSnapshot();
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  },

  // Scoped Firestore document subscription: Active Rider Document
  subscribeToRiderDocument(riderId: string, onUpdate: (rider: PickupBoy | null) => void): Unsubscribe {
    if (!riderId) return () => {};
    let isCancelled = false;
    let pollInterval: number | null = null;
    let unsubSnapshot: Unsubscribe = () => {};

    const fetchRiderDocViaPolling = async () => {
      try {
        const ref = doc(db, 'riders', riderId);
        const docSnap = await getDoc(ref);
        if (isCancelled) return;
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
      } catch (err: any) {
        console.warn('[CloudSync] Polling fallback for rider doc error:', err?.message || err);
      }
    };

    const activateFallback = (reason: string) => {
      console.warn(`[CloudSync] Rider doc listener paused for ${riderId}, falling back to interval polling (15s):`, reason);
      fetchRiderDocViaPolling();
      if (!pollInterval) {
        pollInterval = window.setInterval(fetchRiderDocViaPolling, 15000);
      }
    };

    try {
      const ref = doc(db, 'riders', riderId);
      unsubSnapshot = onSnapshot(
        ref,
        {
          next: (docSnap) => {
            if (isCancelled) return;
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
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
          error: (err) => {
            if (isCancelled) return;
            activateFallback(err?.message || 'Listener error');
          }
        }
      );
    } catch (e: any) {
      activateFallback(e?.message || 'Init error');
    }

    return () => {
      isCancelled = true;
      unsubSnapshot();
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  },

  // Real-time snapshot subscription for ALL trips in 'trips' collection (for Admin)
  subscribeToTrips(onUpdate: (trips: any[]) => void): Unsubscribe {
    try {
      return onSnapshot(
        collection(db, 'trips'),
        (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            list.push({
              id: docSnap.id,
              ...data
            });
          });
          onUpdate(list);
        },
        (err) => {
          console.warn('[CloudSync] Trips collection subscription notice:', err?.message || err);
        }
      );
    } catch (e) {
      console.warn('[CloudSync] subscribeToTrips init exception:', e);
      return () => {};
    }
  },

  // Scoped real-time subscription for Rider Trips ('trips' collection)
  subscribeToRiderTrips(riderId: string, riderPhone?: string, onUpdate?: (trips: any[]) => void): Unsubscribe {
    if (!riderId || !onUpdate) return () => {};
    try {
      const cleanPhone = (riderPhone || '').replace(/\D/g, '');
      return onSnapshot(
        collection(db, 'trips'),
        (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const tPhone = (data.riderPhone || '').replace(/\D/g, '');
            const isMatchRider =
              data.riderId === riderId ||
              data.assignedRiderId === riderId ||
              (cleanPhone && tPhone === cleanPhone) ||
              (riderPhone && data.riderPhone === riderPhone);

            const isMatchingStatus = ['assigned', 'in_transit', 'started', 'completed'].includes(data.status);

            if (isMatchRider && isMatchingStatus) {
              list.push({
                id: docSnap.id,
                ...data
              });
            }
          });
          onUpdate(list);
        },
        (err) => {
          console.warn(`[CloudSync] Rider trips subscription notice for ${riderId}:`, err?.message || err);
        }
      );
    } catch (e) {
      console.warn('[CloudSync] subscribeToRiderTrips init exception:', e);
      return () => {};
    }
  },

  // Scoped real-time subscription for Client Trips ('trips' collection)
  subscribeToClientTrips(
    clientId: string,
    clientEmailOrCb?: string | ((trips: any[]) => void),
    maybeCb?: (trips: any[]) => void
  ): Unsubscribe {
    let clientEmail: string | undefined;
    let onUpdate: ((trips: any[]) => void) | undefined;

    if (typeof clientEmailOrCb === 'function') {
      onUpdate = clientEmailOrCb;
      clientEmail = undefined;
    } else {
      clientEmail = clientEmailOrCb;
      onUpdate = maybeCb;
    }

    if (!clientId && !clientEmail) return () => {};
    if (!onUpdate) return () => {};

    try {
      const cleanEmail = (clientEmail || '').trim().toLowerCase();
      return onSnapshot(
        collection(db, 'trips'),
        (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const docEmail = (data.clientEmail || '').trim().toLowerCase();
            const isMatchClient =
              (clientId && (data.clientId === clientId || data.clientLabId === clientId)) ||
              (cleanEmail && docEmail === cleanEmail);

            const isMatchingStatus = ['assigned', 'in_transit', 'started', 'completed'].includes(data.status);

            if (isMatchClient && isMatchingStatus) {
              list.push({
                id: docSnap.id,
                ...data
              });
            }
          });
          onUpdate!(list);
        },
        (err) => {
          console.warn(`[CloudSync] Client trips subscription notice for ${clientId || clientEmail}:`, err?.message || err);
        }
      );
    } catch (e) {
      console.warn('[CloudSync] subscribeToClientTrips init exception:', e);
      return () => {};
    }
  }
};
