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

// Throttle cache for trip and rider cloud location writes
const locationWriteThrottleMap = new Map<string, { timestamp: number; lat: number; lng: number }>();

/**
 * Database Auto-Seeder & Live Write Enforcer:
 * Checks if 'clients' and 'riders' collections are empty.
 * If empty, executes real setDoc writes so data immediately appears in Firebase Console.
 * Cached in sessionStorage so it only checks once per session.
 */
export async function seedCoreCollectionsIfEmpty(): Promise<{ clientsSeeded: boolean; ridersSeeded: boolean }> {
  if (typeof window !== 'undefined' && sessionStorage.getItem('smvt_core_seeded_v1')) {
    return { clientsSeeded: false, ridersSeeded: false };
  }

  let clientsSeeded = false;
  let ridersSeeded = false;

  try {
    // 1. Check clients collection
    const clientsSnap = await getDocs(collection(db, 'clients'));
    if (clientsSnap.empty) {
      console.log('[AutoSeeder] clients collection is empty. Seeding clients/client_lifecare to Firestore...');
      const lifecareDoc = {
        id: 'client_lifecare',
        name: 'Lifecare Diagnostics',
        email: 'jayesh.joshi@lifecarediagnostics.com',
        address: 'Cosmos Plaza, 206, D.N. Nagar, Andheri West, Mumbai 400053',
        lat: 19.1287852,
        lng: 72.8294183,
        ratePerRound: 130,
        billingRatePerPickup: 130,
        isActive: true,
        active: true,
        role: 'client',
        contactPerson: 'Dr. Jayesh Joshi',
        phone: '+91 98200 98200',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'clients', 'client_lifecare'), lifecareDoc, { merge: true });
      clientsSeeded = true;
      console.log('[AutoSeeder] Successfully seeded clients/client_lifecare to Firestore.');
    }

    // 2. Check riders collection
    const ridersSnap = await getDocs(collection(db, 'riders'));
    if (ridersSnap.empty) {
      console.log('[AutoSeeder] riders collection is empty. Seeding riders/rider_asif to Firestore...');
      const asifDoc = {
        id: 'rider_asif',
        name: 'Asif',
        phone: '8268826200',
        password: 'Asif@6200',
        vehicle: 'MH01AV8888',
        vehicleNo: 'MH01AV8888',
        vehicleNumber: 'MH01AV8888',
        lat: 19.1287,
        lng: 72.8294,
        isOnline: true,
        dutyStatus: 'available',
        role: 'rider',
        status: 'active',
        assignedRouteIds: ['route_lifecare_andheri'],
        batteryLevel: 95,
        battery: 95,
        shiftTimings: '08:00 AM - 04:00 PM (Morning Slot)',
        currentLocation: {
          lat: 19.1287,
          lng: 72.8294,
          timestamp: new Date().toISOString()
        },
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'riders', 'rider_asif'), asifDoc, { merge: true });
      ridersSeeded = true;
      console.log('[AutoSeeder] Successfully seeded riders/rider_asif to Firestore.');
    }

    // 3. Ensure a collection route exists for Lifecare if routes collection is empty
    const routesSnap = await getDocs(collection(db, 'routes'));
    if (routesSnap.empty) {
      console.log('[AutoSeeder] routes collection is empty. Seeding routes/route_lifecare_andheri to Firestore...');
      const routeDoc = {
        id: 'route_lifecare_andheri',
        clientId: 'client_lifecare',
        name: 'Lifecare Andheri West Specimen Collection Loop',
        description: 'Andheri West & Lokhandwala Clinics to Lifecare Central Hub',
        destinationName: 'Lifecare Diagnostics',
        destinationAddress: 'Cosmos Plaza, 206, D.N. Nagar, Andheri West, Mumbai 400053',
        destinationLat: 19.1287852,
        destinationLng: 72.8294183,
        destinationContact: 'Dr. Jayesh Joshi',
        destinationPhone: '+91 98200 98200',
        destinationLab: {
          name: 'Lifecare Diagnostics',
          address: 'Cosmos Plaza, 206, D.N. Nagar, Andheri West, Mumbai 400053',
          lat: 19.1287852,
          lng: 72.8294183
        },
        stops: [
          {
            id: 'stop_1_lokhandwala',
            name: 'Lokhandwala Collection Centre',
            address: '4th Cross Road, Lokhandwala Complex, Andheri West',
            lat: 19.1415,
            lng: 72.8285,
            contactPerson: 'Dr. Sneha Desai',
            phone: '+91 98201 55667',
            order: 1
          },
          {
            id: 'stop_2_dn_nagar',
            name: 'DN Nagar Metro Diagnostic Hub',
            address: 'Link Road, Near DN Nagar Metro, Andheri West',
            lat: 19.1305,
            lng: 72.8335,
            contactPerson: 'Sister Anjali Rao',
            phone: '+91 98202 77889',
            order: 2
          },
          {
            id: 'stop_3_versova',
            name: 'Versova Pathology Point',
            address: 'Yari Road, Versova, Mumbai',
            lat: 19.1360,
            lng: 72.8150,
            contactPerson: 'Karan Varma',
            phone: '+91 98203 99001',
            order: 3
          }
        ],
        timeSlots: ['09:00', '12:00', '15:00', '18:00']
      };
      await setDoc(doc(db, 'routes', 'route_lifecare_andheri'), routeDoc, { merge: true });
      console.log('[AutoSeeder] Successfully seeded routes/route_lifecare_andheri to Firestore.');
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('smvt_core_seeded_v1', 'true');
    }
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
      console.warn('[AutoSeeder] Firestore quota limit reached; using local seed data.');
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('smvt_core_seeded_v1', 'true');
      }
    } else {
      console.error('Firestore Write Error:', err);
    }
  }

  return { clientsSeeded, ridersSeeded };
}

// Auto-seed core collections at startup
seedCoreCollectionsIfEmpty().catch((err) => {
  console.error('Firestore Write Error:', err);
});

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
      contactPerson: s.contactPerson || 'Hospital OPD Desk',
      phone: s.phone || '+91 98201 11223'
    };
  });

  const stopsProgress: any[] = unifiedStops.map((s: any, idx: number) => ({
    stopId: s.id || `stop-${idx + 1}`,
    stopName: s.stopName,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    contactPerson: s.contactPerson || 'Hospital OPD Desk',
    phone: s.phone || '+91 98201 11223',
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
    riderVehicle: data.riderVehicle || data.vehicleNumber || 'MH02TN0897',
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
      address: s.address || 'Diagnostic Collection Point, Mumbai',
      coords: [Number(s.lat || 19.1287852), Number(s.lng || 72.8294183)] as [number, number],
      specimenCount: Number(s.specimenCount ?? s.sampleCount ?? 0),
      status: 'pending' as 'pending' | 'in_progress' | 'completed',
      id: s.id || s.stopId || `stop-${idx + 1}`,
      stopId: s.stopId || s.id || `stop-${idx + 1}`,
      contactPerson: s.contactPerson || 'Lab Coordinator',
      phone: s.phone || '+91 98201 11223',
      notes: s.notes || ''
    }));

    // Exact Unified Trip document model
    const tripDocPayload = {
      id: tripId,
      clientId: payload.client.id,
      clientName: payload.client.name,
      clientEmail: (payload.client as any).email || 'jayesh.joshi@lifecarediagnostics.com',
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
      riderVehicle: payload.rider.vehicleNumber || 'MH02TN0897',
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

    try {
      const cleanName = (clientName || '').trim().toLowerCase();
      return onSnapshot(
        collection(db, 'tasks'),
        (snapshot) => {
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
        (err) => {
          console.warn(`[CloudSync] Client tasks subscription notice for ${clientId || clientName}:`, err?.message || err);
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
      const cleanPhone = (riderPhone || '').replace(/\D/g, '');
      return onSnapshot(
        collection(db, 'tasks'),
        (snapshot) => {
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
