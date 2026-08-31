export type UserRole = 'admin' | 'client' | 'rider';

export interface AdminSession {
  role: 'admin';
  email: string;
  token?: string;
  id?: string;
  name?: string;
  phone?: string;
  mustChangePassword?: boolean;
  loginTimestamp?: string;
}

export interface ClientSession {
  role: 'client';
  clientId: string;
  name: string;
  email?: string;
  phone?: string;
  token?: string;
  id?: string;
  mustChangePassword?: boolean;
  isPreview?: boolean;
  loginTimestamp?: string;
}

export interface RiderSession {
  role: 'rider';
  riderId: string;
  phone: string;
  name?: string;
  email?: string;
  token?: string;
  id?: string;
  avatar?: string;
  vehicleNo?: string;
  vehicleNumber?: string;
  vehicleType?: string;
  mustChangePassword?: boolean;
  loginTimestamp?: string;
}

export interface UserAuth {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  clientId?: string; // If role === 'client'
  riderId?: string;  // If role === 'rider'
  phone?: string;
  avatar?: string;
  mustChangePassword?: boolean;
  isPreview?: boolean;
}

export interface RouteStop {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  contactPerson: string;
  phone: string;
  order: number;
  avgPickupDurationMinutes?: number;
}

export interface DestinationLab {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  contactPerson: string;
  phone: string;
}

export interface Route {
  id: string;
  clientId: string;
  name: string;
  description?: string;
  destinationLab: DestinationLab;
  stops: RouteStop[];
  timeSlots: string[]; // e.g. ["10:00", "14:00", "18:00", "22:00"]
  active: boolean;
  assignedRiderId?: string;
}

export interface Client {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  password?: string;
  role?: 'client';
  status?: 'active' | 'inactive';
  address: string;
  active: boolean;
  createdAt: string;
  billingRatePerPickup?: number;
  area?: string;
  lat?: number;
  lng?: number;
  location?: any;
  mustChangePassword?: boolean;
  failedAttempts?: number;
  lockoutUntil?: string;
  lastLoginAt?: string;
}

export type RiderStatus = 'active' | 'on_leave' | 'inactive';

export interface PickupBoy {
  id: string;
  name: string;
  phone: string;
  email: string;
  password?: string;
  role?: 'rider';
  photoUrl: string;
  vehicleNumber: string;
  plateNumber?: string;
  vehicleType: string; // e.g., 'Hero Splendor / Motorcycle'
  shiftTimings?: string; // e.g. '08:00 AM - 04:00 PM'
  assignedRouteIds: string[];
  status: RiderStatus;
  joiningDate: string;
  area?: string;
  lat?: number;
  lng?: number;
  speed?: number;
  location?: any;
  currentLocation?: {
    lat: number;
    lng: number;
    timestamp: string;
    heading?: number;
    speed?: number;
    accuracy?: number;
    location?: any;
  };
  batteryLevel?: number;
  isOnline: boolean;
  isCheckedIn: boolean;
  lastPingTime?: string;
  lastUpdated?: any;
  heading?: number;
  mustChangePassword?: boolean;
  failedAttempts?: number;
  lockoutUntil?: string;
  lastLoginAt?: string;
}

export type TaskStatus =
  | 'upcoming'
  | 'started'
  | 'at_stop'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'delayed'
  | 'missed'
  | 'pending'
  | 'in_progress'
  | 'completed';

export type StopStatus = 'pending' | 'arrived' | 'picked_up' | 'no_sample';

export interface StopExecution {
  stopId: string;
  stopName: string;
  address: string;
  lat: number;
  lng: number;
  contactPerson: string;
  phone: string;
  status: StopStatus;
  arrivedAt?: string;
  completedAt?: string;
  pickedUpAt?: string;
  sampleCount?: number;
  photoUrl?: string;
  photoLocation?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  photoTimestamp?: string;
  coldBoxTemp?: number; // In Celsius, e.g. 4.2°C
  notes?: string;
  noSampleReason?: string;
}

export type StopProgress = StopExecution;

export interface DestinationDropExecution {
  name: string;
  address: string;
  lat: number;
  lng: number;
  status?: string;
  arrivedAt?: string;
  deliveredAt?: string;
  receiverName?: string;
  receiverDesignation?: string;
  dropPhotoUrl?: string;
  handoverPhotoUrl?: string;
  dropLocation?: {
    lat: number;
    lng: number;
  };
  dropTimestamp?: string;
  coldBoxTempAtDrop?: number;
  totalVialsHandedOver?: number;
  notes?: string;
}

export interface IssueFlag {
  id: string;
  type?: 'delay' | 'hospital_not_ready' | 'sample_rejected' | 'chiller_temp_alert' | 'traffic' | 'vehicle_breakdown' | 'other';
  reason?: string;
  description?: string;
  reportedAt: string;
  reportedByRiderId?: string;
  reportedByRiderName?: string;
  resolved: boolean;
  resolvedAt?: string;
}

export interface PickupTask {
  id: string;
  title?: string;
  type?: 'stat_urgent' | 'routine_loop' | 'temperature_critical' | 'biopsy_transfer' | string;
  assignedRiderId?: string;
  priority?: 'urgent' | 'high' | 'normal';
  area?: string;
  pickupLocation?: {
    name?: string;
    address?: string;
    lat: number;
    lng: number;
    location?: any;
    area?: string;
  };
  deliveryLocation?: {
    name?: string;
    address?: string;
    lat: number;
    lng: number;
    location?: any;
    area?: string;
  };
  pickupGeoPoint?: any;
  deliveryGeoPoint?: any;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "10:00"
  routeId: string;
  routeName: string;
  clientId: string;
  clientName: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  riderVehicle: string;
  status: TaskStatus;
  activeRiderId?: string;
  activeRiderName?: string;
  currentDestinationStop?: string;
  tripStartedAt?: string;
  currentStopIndex: number;
  stopsProgress: StopExecution[];
  destination: DestinationDropExecution;
  isDelayed: boolean;
  delayMinutes?: number;
  issueFlags: IssueFlag[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  riderId: string;
  riderName: string;
  date: string; // YYYY-MM-DD
  checkInTime: string;
  checkInLocation: {
    lat: number;
    lng: number;
    address: string;
    location?: any;
  };
  checkOutTime?: string;
  checkOutLocation?: {
    lat: number;
    lng: number;
    address: string;
    location?: any;
  };
  totalHours?: number;
  status: 'present' | 'on_duty' | 'completed' | 'leave' | 'absent';
  leaveReason?: string;
}

export interface LocationPing {
  id: string;
  riderId: string;
  riderName: string;
  timestamp: string;
  lat: number;
  lng: number;
  location?: any;
  speed?: number;
  heading?: number;
  battery?: number;
  taskId?: string;
}

export type AlertType =
  | 'delay'
  | 'missed_slot'
  | 'task_started'
  | 'stop_arrived'
  | 'pickup_done'
  | 'drop_done'
  | 'issue_reported'
  | 'attendance_checkin'
  | 'attendance_checkout'
  | 'temp_excursion';

export interface NotificationLog {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: string;
  recipientRole: 'admin' | 'client' | 'rider' | 'all';
  recipientId?: string; // clientId or riderId if specific
  relatedTaskId?: string;
  read: boolean;
  channel: 'whatsapp' | 'sms' | 'push' | 'system';
}

export interface AlertsConfig {
  gracePeriodMinutes: number; // e.g., 15 minutes
  tempThresholdMin: number; // e.g. 2.0°C
  tempThresholdMax: number; // e.g. 8.0°C
  autoNotifyAdmin: boolean;
  autoNotifyClient: boolean;
  whatsappAlertsEnabled: boolean;
  smsAlertsEnabled: boolean;
}

export interface OfflineProofQueueItem {
  id: string;
  taskId: string;
  stopId?: string;
  isDrop: boolean;
  photoBlobOrDataUrl: string;
  location: { lat: number; lng: number; accuracy?: number };
  timestamp: string;
  sampleCount?: number;
  coldBoxTemp?: number;
  receiverName?: string;
  notes?: string;
  queuedAt: string;
  status: 'pending' | 'synced' | 'failed';
}
