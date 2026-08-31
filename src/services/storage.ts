import {
  Client,
  Route,
  PickupBoy,
  PickupTask,
  AttendanceRecord,
  LocationPing,
  NotificationLog,
  AlertsConfig,
  OfflineProofQueueItem,
  UserAuth
} from '../types';
import { generateSampleVialPhoto, addWatermarkToImage } from './imageWatermark';
import { CloudSync } from './firebase';
// Storage keys
const STORAGE_KEYS = {
  CLIENTS: 'smvt_clients',
  ROUTES: 'smvt_routes',
  RIDERS: 'smvt_riders',
  TASKS: 'smvt_tasks',
  ATTENDANCE: 'smvt_attendance',
  PINGS: 'smvt_pings',
  NOTIFICATIONS: 'smvt_notifications',
  ALERTS_CONFIG: 'smvt_alerts_config',
  OFFLINE_QUEUE: 'smvt_offline_queue',
  AUTH_USER: 'smvt_auth_user',
  SEEDED: 'smvt_initialized_v3'
};

// Memory store fallback in case localStorage is disabled, restricted, or quota-exceeded
const memoryStore: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch (e) {
    console.warn(`localStorage read error for ${key}:`, e);
  }
  return memoryStore[key] || null;
}

function safeSetItem(key: string, value: string): void {
  memoryStore[key] = value;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn(`localStorage write error for ${key}:`, e);
  }
}

function safeRemoveItem(key: string): void {
  delete memoryStore[key];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn(`localStorage remove error for ${key}:`, e);
  }
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('JSON parse error in StorageService:', err);
    return fallback;
  }
}

// Initial Operational Seed Data
export function ensureInitialized(): void {
  try {
    if (safeGetItem(STORAGE_KEYS.SEEDED)) {
      return;
    }
  } catch {
    // continue
  }

  const defaultClients: Client[] = [
    {
      id: 'client-apex',
      name: 'Apex Diagnostic Center',
      contactPerson: 'Dr. Anita Desai (Ops Director)',
      phone: '+91 98200 11223',
      email: 'ops@apexdiagnostics.in',
      address: 'Plot 42, S.V. Road, Malad West, Mumbai, MH 400064',
      active: true,
      createdAt: '2026-01-15T09:00:00Z',
      billingRatePerPickup: 450
    },
    {
      id: 'client-metropolis',
      name: 'Apex PathLabs & Research',
      contactPerson: 'Mr. Arvind Joshi',
      phone: '+91 98200 44556',
      email: 'collections@apexpathlabs.in',
      address: 'Infinity Tower, Link Road, Andheri West, Mumbai, MH 400053',
      active: true,
      createdAt: '2026-02-01T10:00:00Z',
      billingRatePerPickup: 500
    }
  ];

  const defaultRoutes: Route[] = [
    {
      id: 'route-apex-western-1',
      clientId: 'client-apex',
      name: 'Western Suburbs Collection Loop 1',
      description: 'Daily collection loop covering Kandivali & Goregaon hospitals to Central Processing Lab',
      destinationLab: {
        id: 'dest-apex-central',
        name: 'Apex Central Diagnostic Lab, Malad West',
        address: 'Opp. Inorbit Mall, New Link Road, Malad West, Mumbai 400064',
        lat: 19.1860,
        lng: 72.8485,
        contactPerson: 'Dr. Ramesh Patil (Senior Lab Tech)',
        phone: '+91 98203 34567'
      },
      stops: [
        {
          id: 'stop-kandivali-west',
          name: 'Oscar Hospital, Kandivali West',
          address: 'Plot 18, Mathuradas Road, Kandivali West, Mumbai 400067',
          lat: 19.2082,
          lng: 72.8398,
          contactPerson: 'Sister Sunita Rao (OPD Head)',
          phone: '+91 98201 12345',
          order: 1,
          avgPickupDurationMinutes: 10
        },
        {
          id: 'stop-goregaon-west',
          name: 'Oscar Hospital, Goregaon West',
          address: 'Station Road, Jawahar Nagar, Goregaon West, Mumbai 400104',
          lat: 19.1624,
          lng: 72.8465,
          contactPerson: 'Dr. Vikas Sharma (Pathology Coord)',
          phone: '+91 98202 23456',
          order: 2,
          avgPickupDurationMinutes: 10
        }
      ],
      timeSlots: ['10:00', '14:00', '18:00', '22:00'],
      active: true,
      assignedRiderId: 'rider-rahul'
    }
  ];

  const defaultRiders: PickupBoy[] = [
    {
      id: 'rider-rahul',
      name: 'Rahul Sharma',
      phone: '+91 98765 43210',
      email: 'rahul.sharma@vialtrack.in',
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80',
      vehicleNumber: 'MH-02-DN-4921',
      vehicleType: 'Hero Splendor Plus (Cold-box Mounted)',
      assignedRouteIds: ['route-apex-western-1'],
      status: 'active',
      joiningDate: '2025-11-10',
      currentLocation: {
        lat: 19.1750,
        lng: 72.8430,
        timestamp: new Date().toISOString(),
        heading: 180,
        accuracy: 5
      },
      batteryLevel: 88,
      isOnline: true,
      isCheckedIn: true,
      lastPingTime: new Date().toISOString()
    },
    {
      id: 'rider-amit',
      name: 'Amit Verma',
      phone: '+91 98765 88990',
      email: 'amit.verma@vialtrack.in',
      photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop&crop=faces&q=80',
      vehicleNumber: 'MH-04-EK-9022',
      vehicleType: 'Honda Activa 6G (Chiller Rack)',
      assignedRouteIds: [],
      status: 'active',
      joiningDate: '2026-01-05',
      currentLocation: {
        lat: 19.1197,
        lng: 72.8468,
        timestamp: new Date().toISOString(),
        heading: 90,
        accuracy: 8
      },
      batteryLevel: 94,
      isOnline: true,
      isCheckedIn: true,
      lastPingTime: new Date().toISOString()
    }
  ];

  // Today's date in YYYY-MM-DD
  const todayStr = new Date().toISOString().split('T')[0];

  const photo1Watermarked = generateSampleVialPhoto('vial', '14 Blood Specimen Vials (Oscar Kandivali)');
  const photo2Watermarked = generateSampleVialPhoto('vial', '9 Blood Specimen Vials (Oscar Goregaon)');
  const dropWatermarked = generateSampleVialPhoto('drop', '23 Vials Intake Handover (Apex Central Lab)');

  const defaultTasks: PickupTask[] = [
    // 10:00 Slot - COMPLETED with full proof
    {
      id: `task-${todayStr}-1000`,
      date: todayStr,
      timeSlot: '10:00',
      routeId: 'route-apex-western-1',
      routeName: 'Western Suburbs Collection Loop 1',
      clientId: 'client-apex',
      clientName: 'Apex Diagnostic Center',
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      riderPhone: '+91 98765 43210',
      riderVehicle: 'MH-02-DN-4921',
      status: 'delivered',
      currentStopIndex: 2,
      stopsProgress: [
        {
          stopId: 'stop-kandivali-west',
          stopName: 'Oscar Hospital, Kandivali West',
          address: 'Plot 18, Mathuradas Road, Kandivali West, Mumbai 400067',
          lat: 19.2082,
          lng: 72.8398,
          contactPerson: 'Sister Sunita Rao',
          phone: '+91 98201 12345',
          status: 'picked_up',
          arrivedAt: `${todayStr}T10:12:00Z`,
          completedAt: `${todayStr}T10:18:24Z`,
          sampleCount: 14,
          photoUrl: photo1Watermarked,
          photoLocation: { lat: 19.2082, lng: 72.8398, accuracy: 6 },
          photoTimestamp: `${todayStr}T10:18:24Z`,
          coldBoxTemp: 3.8,
          notes: 'Specimens packaged in primary sealed racks + cold gel packs verified.'
        },
        {
          stopId: 'stop-goregaon-west',
          stopName: 'Oscar Hospital, Goregaon West',
          address: 'Station Road, Jawahar Nagar, Goregaon West, Mumbai 400104',
          lat: 19.1624,
          lng: 72.8465,
          contactPerson: 'Dr. Vikas Sharma',
          phone: '+91 98202 23456',
          status: 'picked_up',
          arrivedAt: `${todayStr}T10:38:00Z`,
          completedAt: `${todayStr}T10:44:10Z`,
          sampleCount: 9,
          photoUrl: photo2Watermarked,
          photoLocation: { lat: 19.1624, lng: 72.8465, accuracy: 5 },
          photoTimestamp: `${todayStr}T10:44:10Z`,
          coldBoxTemp: 4.1,
          notes: '9 EDTA and Serum vials collected from pathology intake.'
        }
      ],
      destination: {
        name: 'Apex Central Diagnostic Lab, Malad West',
        address: 'Opp. Inorbit Mall, New Link Road, Malad West, Mumbai 400064',
        lat: 19.1860,
        lng: 72.8485,
        arrivedAt: `${todayStr}T11:01:00Z`,
        deliveredAt: `${todayStr}T11:05:42Z`,
        receiverName: 'Dr. Ramesh Patil',
        receiverDesignation: 'Senior Pathology Technologist',
        dropPhotoUrl: dropWatermarked,
        dropLocation: { lat: 19.1860, lng: 72.8485 },
        dropTimestamp: `${todayStr}T11:05:42Z`,
        coldBoxTempAtDrop: 3.9,
        totalVialsHandedOver: 23,
        notes: 'All 23 specimen vials received in intact cold-chain condition (3.9°C).'
      },
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: [],
      createdAt: `${todayStr}T09:30:00Z`,
      startedAt: `${todayStr}T09:55:00Z`,
      completedAt: `${todayStr}T11:05:42Z`
    },

    // 14:00 Slot - IN PROGRESS / ACTIVE ON ROUTE
    {
      id: `task-${todayStr}-1400`,
      date: todayStr,
      timeSlot: '14:00',
      routeId: 'route-apex-western-1',
      routeName: 'Western Suburbs Collection Loop 1',
      clientId: 'client-apex',
      clientName: 'Apex Diagnostic Center',
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      riderPhone: '+91 98765 43210',
      riderVehicle: 'MH-02-DN-4921',
      status: 'in_transit',
      currentStopIndex: 1,
      stopsProgress: [
        {
          stopId: 'stop-kandivali-west',
          stopName: 'Oscar Hospital, Kandivali West',
          address: 'Plot 18, Mathuradas Road, Kandivali West, Mumbai 400067',
          lat: 19.2082,
          lng: 72.8398,
          contactPerson: 'Sister Sunita Rao',
          phone: '+91 98201 12345',
          status: 'picked_up',
          arrivedAt: `${todayStr}T14:08:00Z`,
          completedAt: `${todayStr}T14:15:30Z`,
          sampleCount: 16,
          photoUrl: photo1Watermarked,
          photoLocation: { lat: 19.2082, lng: 72.8398, accuracy: 5 },
          photoTimestamp: `${todayStr}T14:15:30Z`,
          coldBoxTemp: 4.0,
          notes: '16 vials collected on schedule.'
        },
        {
          stopId: 'stop-goregaon-west',
          stopName: 'Oscar Hospital, Goregaon West',
          address: 'Station Road, Jawahar Nagar, Goregaon West, Mumbai 400104',
          lat: 19.1624,
          lng: 72.8465,
          contactPerson: 'Dr. Vikas Sharma',
          phone: '+91 98202 23456',
          status: 'arrived',
          arrivedAt: `${todayStr}T14:38:00Z`,
          sampleCount: 0,
          coldBoxTemp: 4.2
        }
      ],
      destination: {
        name: 'Apex Central Diagnostic Lab, Malad West',
        address: 'Opp. Inorbit Mall, New Link Road, Malad West, Mumbai 400064',
        lat: 19.1860,
        lng: 72.8485
      },
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: [],
      createdAt: `${todayStr}T13:30:00Z`,
      startedAt: `${todayStr}T13:58:00Z`
    },

    // 18:00 Slot - UPCOMING
    {
      id: `task-${todayStr}-1800`,
      date: todayStr,
      timeSlot: '18:00',
      routeId: 'route-apex-western-1',
      routeName: 'Western Suburbs Collection Loop 1',
      clientId: 'client-apex',
      clientName: 'Apex Diagnostic Center',
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      riderPhone: '+91 98765 43210',
      riderVehicle: 'MH-02-DN-4921',
      status: 'upcoming',
      currentStopIndex: 0,
      stopsProgress: [
        {
          stopId: 'stop-kandivali-west',
          stopName: 'Oscar Hospital, Kandivali West',
          address: 'Plot 18, Mathuradas Road, Kandivali West, Mumbai 400067',
          lat: 19.2082,
          lng: 72.8398,
          contactPerson: 'Sister Sunita Rao',
          phone: '+91 98201 12345',
          status: 'pending'
        },
        {
          stopId: 'stop-goregaon-west',
          stopName: 'Oscar Hospital, Goregaon West',
          address: 'Station Road, Jawahar Nagar, Goregaon West, Mumbai 400104',
          lat: 19.1624,
          lng: 72.8465,
          contactPerson: 'Dr. Vikas Sharma',
          phone: '+91 98202 23456',
          status: 'pending'
        }
      ],
      destination: {
        name: 'Apex Central Diagnostic Lab, Malad West',
        address: 'Opp. Inorbit Mall, New Link Road, Malad West, Mumbai 400064',
        lat: 19.1860,
        lng: 72.8485
      },
      isDelayed: false,
      issueFlags: [],
      createdAt: `${todayStr}T09:00:00Z`
    },

    // 22:00 Slot - UPCOMING
    {
      id: `task-${todayStr}-2200`,
      date: todayStr,
      timeSlot: '22:00',
      routeId: 'route-apex-western-1',
      routeName: 'Western Suburbs Collection Loop 1',
      clientId: 'client-apex',
      clientName: 'Apex Diagnostic Center',
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      riderPhone: '+91 98765 43210',
      riderVehicle: 'MH-02-DN-4921',
      status: 'upcoming',
      currentStopIndex: 0,
      stopsProgress: [
        {
          stopId: 'stop-kandivali-west',
          stopName: 'Oscar Hospital, Kandivali West',
          address: 'Plot 18, Mathuradas Road, Kandivali West, Mumbai 400067',
          lat: 19.2082,
          lng: 72.8398,
          contactPerson: 'Sister Sunita Rao',
          phone: '+91 98201 12345',
          status: 'pending'
        },
        {
          stopId: 'stop-goregaon-west',
          stopName: 'Oscar Hospital, Goregaon West',
          address: 'Station Road, Jawahar Nagar, Goregaon West, Mumbai 400104',
          lat: 19.1624,
          lng: 72.8465,
          contactPerson: 'Dr. Vikas Sharma',
          phone: '+91 98202 23456',
          status: 'pending'
        }
      ],
      destination: {
        name: 'Apex Central Diagnostic Lab, Malad West',
        address: 'Opp. Inorbit Mall, New Link Road, Malad West, Mumbai 400064',
        lat: 19.1860,
        lng: 72.8485
      },
      isDelayed: false,
      issueFlags: [],
      createdAt: `${todayStr}T09:00:00Z`
    }
  ];

  const defaultAttendance: AttendanceRecord[] = [
    {
      id: `att-${todayStr}-rahul`,
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      date: todayStr,
      checkInTime: `${todayStr}T09:15:00Z`,
      checkInLocation: {
        lat: 19.2082,
        lng: 72.8398,
        address: 'Kandivali West Hub, Mumbai'
      },
      status: 'on_duty',
      totalHours: 5.2
    },
    {
      id: `att-${todayStr}-amit`,
      riderId: 'rider-amit',
      riderName: 'Amit Verma',
      date: todayStr,
      checkInTime: `${todayStr}T09:30:00Z`,
      checkInLocation: {
        lat: 19.1197,
        lng: 72.8468,
        address: 'Andheri West Hub, Mumbai'
      },
      status: 'on_duty',
      totalHours: 5.0
    }
  ];

  const defaultPings: LocationPing[] = [
    {
      id: 'ping-1',
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      timestamp: `${todayStr}T14:15:00Z`,
      lat: 19.2082,
      lng: 72.8398,
      speed: 0,
      heading: 180,
      battery: 88,
      taskId: `task-${todayStr}-1400`
    },
    {
      id: 'ping-2',
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      timestamp: `${todayStr}T14:25:00Z`,
      lat: 19.1880,
      lng: 72.8430,
      speed: 28,
      heading: 175,
      battery: 87,
      taskId: `task-${todayStr}-1400`
    },
    {
      id: 'ping-3',
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      timestamp: `${todayStr}T14:38:00Z`,
      lat: 19.1624,
      lng: 72.8465,
      speed: 0,
      heading: 180,
      battery: 86,
      taskId: `task-${todayStr}-1400`
    }
  ];

  const defaultNotifications: NotificationLog[] = [
    {
      id: 'notif-1',
      type: 'drop_done',
      title: 'Slot 10:00 Delivered Successfully',
      message: 'Rahul Sharma handed over 23 vials to Dr. Ramesh Patil at Central Processing Lab. Temp: 3.9°C (Verified Safe).',
      timestamp: `${todayStr}T11:06:00Z`,
      recipientRole: 'all',
      recipientId: 'client-apex',
      relatedTaskId: `task-${todayStr}-1000`,
      read: true,
      channel: 'whatsapp'
    },
    {
      id: 'notif-2',
      type: 'task_started',
      title: 'Slot 14:00 Round Started',
      message: 'Rahul Sharma has started Western Suburbs Collection Loop 1.',
      timestamp: `${todayStr}T13:58:00Z`,
      recipientRole: 'all',
      recipientId: 'client-apex',
      relatedTaskId: `task-${todayStr}-1400`,
      read: false,
      channel: 'push'
    },
    {
      id: 'notif-3',
      type: 'pickup_done',
      title: 'Pickup Done: Oscar Hospital Kandivali (16 Vials)',
      message: '16 vials collected by Rahul Sharma. Cold-box temperature: 4.0°C. En route to Goregaon stop.',
      timestamp: `${todayStr}T14:16:00Z`,
      recipientRole: 'client',
      recipientId: 'client-apex',
      relatedTaskId: `task-${todayStr}-1400`,
      read: false,
      channel: 'sms'
    }
  ];

  const defaultAlertsConfig: AlertsConfig = {
    gracePeriodMinutes: 15,
    tempThresholdMin: 2.0,
    tempThresholdMax: 8.0,
    autoNotifyAdmin: true,
    autoNotifyClient: true,
    whatsappAlertsEnabled: true,
    smsAlertsEnabled: true
  };

  try {
    safeSetItem(STORAGE_KEYS.CLIENTS, JSON.stringify(defaultClients));
    safeSetItem(STORAGE_KEYS.ROUTES, JSON.stringify(defaultRoutes));
    safeSetItem(STORAGE_KEYS.RIDERS, JSON.stringify(defaultRiders));
    safeSetItem(STORAGE_KEYS.TASKS, JSON.stringify(defaultTasks));
    safeSetItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(defaultAttendance));
    safeSetItem(STORAGE_KEYS.PINGS, JSON.stringify(defaultPings));
    safeSetItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(defaultNotifications));
    safeSetItem(STORAGE_KEYS.ALERTS_CONFIG, JSON.stringify(defaultAlertsConfig));
    safeSetItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify([]));
    safeSetItem(STORAGE_KEYS.SEEDED, 'true');
  } catch (err) {
    console.error('Failed to initialize seed storage', err);
  }
}

// Initial Seed Data (Async enhancement)
export async function initializeSeedData(): Promise<void> {
  ensureInitialized();
}

// Storage API methods
export const StorageService = {
  // Clients
  getClients(): Client[] {
    ensureInitialized();
    const raw = safeGetItem(STORAGE_KEYS.CLIENTS);
    return safeParse<Client[]>(raw, []);
  },
  saveClients(clients: Client[]): void {
    safeSetItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
  },
  getClientById(id: string): Client | undefined {
    return this.getClients().find((c) => c.id === id);
  },
  addClient(client: Client): void {
    const clients = this.getClients();
    clients.unshift(client);
    this.saveClients(clients);
    CloudSync.syncDocument('clients', client.id, client);
  },
  updateClient(client: Client): void {
    const clients = this.getClients().map((c) => (c.id === client.id ? client : c));
    this.saveClients(clients);
    CloudSync.syncDocument('clients', client.id, client);
  },
  deleteClient(id: string): void {
    const clients = this.getClients().filter((c) => c.id !== id);
    this.saveClients(clients);
    CloudSync.deleteDocument('clients', id);
  },

  // Routes
  getRoutes(): Route[] {
    ensureInitialized();
    const raw = safeGetItem(STORAGE_KEYS.ROUTES);
    return safeParse<Route[]>(raw, []);
  },
  saveRoutes(routes: Route[]): void {
    safeSetItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes));
  },
  getRoutesByClientId(clientId: string): Route[] {
    return this.getRoutes().filter((r) => r.clientId === clientId);
  },
  getRouteById(id: string): Route | undefined {
    return this.getRoutes().find((r) => r.id === id);
  },
  addRoute(route: Route): void {
    const routes = this.getRoutes();
    routes.push(route);
    this.saveRoutes(routes);
    CloudSync.syncDocument('routes', route.id, route);
  },
  updateRoute(route: Route): void {
    const routes = this.getRoutes().map((r) => (r.id === route.id ? route : r));
    this.saveRoutes(routes);
    CloudSync.syncDocument('routes', route.id, route);
  },
  deleteRoute(id: string): void {
    const routes = this.getRoutes().filter((r) => r.id !== id);
    this.saveRoutes(routes);
    CloudSync.deleteDocument('routes', id);
  },

  // Riders
  getRiders(): PickupBoy[] {
    ensureInitialized();
    const raw = safeGetItem(STORAGE_KEYS.RIDERS);
    return safeParse<PickupBoy[]>(raw, []);
  },
  saveRiders(riders: PickupBoy[]): void {
    safeSetItem(STORAGE_KEYS.RIDERS, JSON.stringify(riders));
  },
  getRiderById(id: string): PickupBoy | undefined {
    return this.getRiders().find((r) => r.id === id);
  },
  addRider(rider: PickupBoy): void {
    const riders = this.getRiders();
    riders.unshift(rider);
    this.saveRiders(riders);
    CloudSync.syncDocument('riders', rider.id, rider);
  },
  updateRider(rider: PickupBoy): void {
    const riders = this.getRiders().map((r) => (r.id === rider.id ? rider : r));
    this.saveRiders(riders);
    CloudSync.syncDocument('riders', rider.id, rider);
  },
  deleteRider(id: string): void {
    const riders = this.getRiders().filter((r) => r.id !== id);
    this.saveRiders(riders);
    CloudSync.deleteDocument('riders', id);
  },

  // Tasks
  getTasks(): PickupTask[] {
    ensureInitialized();
    const raw = safeGetItem(STORAGE_KEYS.TASKS);
    return safeParse<PickupTask[]>(raw, []);
  },
  saveTasks(tasks: PickupTask[]): void {
    safeSetItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    CloudSync.syncCollection('tasks', tasks);
  },
  getTaskById(id: string): PickupTask | undefined {
    return this.getTasks().find((t) => t.id === id);
  },
  getTasksByClientId(clientId: string): PickupTask[] {
    return this.getTasks().filter((t) => t.clientId === clientId);
  },
  getTasksByRiderId(riderId: string): PickupTask[] {
    return this.getTasks().filter((t) => t.riderId === riderId);
  },
  addTask(task: PickupTask): void {
    const tasks = this.getTasks();
    tasks.unshift(task);
    this.saveTasks(tasks);
    CloudSync.syncDocument('tasks', task.id, task);
  },
  updateTask(task: PickupTask): void {
    const tasks = this.getTasks().map((t) => (t.id === task.id ? task : t));
    safeSetItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    CloudSync.syncDocument('tasks', task.id, task);
  },
  deleteTask(id: string): void {
    const tasks = this.getTasks().filter((t) => t.id !== id);
    safeSetItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    CloudSync.deleteDocument('tasks', id);
  },

  // Attendance
  getAttendance(): AttendanceRecord[] {
    ensureInitialized();
    const raw = safeGetItem(STORAGE_KEYS.ATTENDANCE);
    return safeParse<AttendanceRecord[]>(raw, []);
  },
  saveAttendance(attendance: AttendanceRecord[]): void {
    safeSetItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendance));
    CloudSync.syncCollection('attendance', attendance);
  },
  addAttendanceRecord(record: AttendanceRecord): void {
    const records = this.getAttendance();
    records.unshift(record);
    this.saveAttendance(records);
    CloudSync.syncDocument('attendance', record.id, record);
  },
  updateAttendanceRecord(record: AttendanceRecord): void {
    const records = this.getAttendance().map((a) => (a.id === record.id ? record : a));
    this.saveAttendance(records);
    CloudSync.syncDocument('attendance', record.id, record);
  },

  // Location Pings
  getPings(): LocationPing[] {
    const raw = safeGetItem(STORAGE_KEYS.PINGS);
    return safeParse<LocationPing[]>(raw, []);
  },
  savePings(pings: LocationPing[]): void {
    safeSetItem(STORAGE_KEYS.PINGS, JSON.stringify(pings));
  },
  addPing(ping: LocationPing): void {
    const pings = this.getPings();
    pings.push(ping);
    // Keep max 500 pings
    if (pings.length > 500) {
      pings.splice(0, pings.length - 500);
    }
    this.savePings(pings);
  },
  getPingsByRider(riderId: string): LocationPing[] {
    return this.getPings().filter((p) => p.riderId === riderId);
  },

  // Notifications
  getNotifications(): NotificationLog[] {
    const raw = safeGetItem(STORAGE_KEYS.NOTIFICATIONS);
    return safeParse<NotificationLog[]>(raw, []);
  },
  saveNotifications(notifs: NotificationLog[]): void {
    safeSetItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
  },
  addNotification(notif: NotificationLog): void {
    const notifs = this.getNotifications();
    notifs.unshift(notif);
    this.saveNotifications(notifs);
  },
  markNotificationRead(id: string): void {
    const notifs = this.getNotifications().map((n) => (n.id === id ? { ...n, read: true } : n));
    this.saveNotifications(notifs);
  },
  markAllNotificationsRead(): void {
    const notifs = this.getNotifications().map((n) => ({ ...n, read: true }));
    this.saveNotifications(notifs);
  },

  // Alerts Config
  getAlertsConfig(): AlertsConfig {
    const raw = safeGetItem(STORAGE_KEYS.ALERTS_CONFIG);
    return safeParse<AlertsConfig>(raw, {
      gracePeriodMinutes: 15,
      tempThresholdMin: 2.0,
      tempThresholdMax: 8.0,
      autoNotifyAdmin: true,
      autoNotifyClient: true,
      whatsappAlertsEnabled: true,
      smsAlertsEnabled: true
    });
  },
  saveAlertsConfig(config: AlertsConfig): void {
    safeSetItem(STORAGE_KEYS.ALERTS_CONFIG, JSON.stringify(config));
  },

  // Offline Queue
  getOfflineQueue(): OfflineProofQueueItem[] {
    const raw = safeGetItem(STORAGE_KEYS.OFFLINE_QUEUE);
    return safeParse<OfflineProofQueueItem[]>(raw, []);
  },
  saveOfflineQueue(queue: OfflineProofQueueItem[]): void {
    safeSetItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  },
  addToOfflineQueue(item: OfflineProofQueueItem): void {
    const queue = this.getOfflineQueue();
    queue.push(item);
    this.saveOfflineQueue(queue);
  },
  removeFromOfflineQueue(id: string): void {
    const queue = this.getOfflineQueue().filter((item) => item.id !== id);
    this.saveOfflineQueue(queue);
  },

  // Auth User Session
  getAuthUser(): UserAuth | null {
    const raw = safeGetItem(STORAGE_KEYS.AUTH_USER);
    return safeParse<UserAuth | null>(raw, null);
  },
  getCurrentUser(): UserAuth | null {
    return this.getAuthUser();
  },
  setAuthUser(user: UserAuth | null): void {
    if (user) {
      safeSetItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(user));
    } else {
      safeRemoveItem(STORAGE_KEYS.AUTH_USER);
    }
  },
  setCurrentUser(user: UserAuth | null): void {
    this.setAuthUser(user);
  },

  // Reset demo data helper
  resetToDemo(): void {
    safeRemoveItem(STORAGE_KEYS.SEEDED);
    initializeSeedData();
  },
  resetToDefaults(): void {
    this.resetToDemo();
  },
  initializeSeedData(): Promise<void> {
    return initializeSeedData();
  },
  ensureInitialized(): void {
    ensureInitialized();
  }
};
