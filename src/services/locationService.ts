import { LocationPing, PickupBoy, PickupTask } from '../types';
import { StorageService } from './storage';
import { CloudSync } from './firebase';

// Coordinates waypoint list along the Mumbai Western Suburbs route
export const DEMO_ROUTE_WAYPOINTS = [
  { name: 'Kandivali Hub', lat: 19.2082, lng: 72.8398 },
  { name: 'S.V. Road Junction', lat: 19.1980, lng: 72.8420 },
  { name: 'Malad Link Road', lat: 19.1860, lng: 72.8485 },
  { name: 'Goregaon West Signal', lat: 19.1720, lng: 72.8440 },
  { name: 'Oscar Hospital Goregaon', lat: 19.1624, lng: 72.8465 },
  { name: 'Inorbit Flyover', lat: 19.1790, lng: 72.8475 },
  { name: 'Apex Central Lab', lat: 19.1860, lng: 72.8485 }
];

// Distance calculation (Haversine formula in km)
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Distance in meters
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return calculateDistanceKm(lat1, lon1, lat2, lon2) * 1000;
}

// Calculate ETA in minutes based on distance and average Mumbai city bike speed (25 km/h)
export function calculateEtaMinutes(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const distKm = calculateDistanceKm(fromLat, fromLng, toLat, toLng);
  const avgSpeedKmh = 24; // avg bike speed in traffic
  const hours = distKm / avgSpeedKmh;
  const minutes = Math.ceil(hours * 60) + 2; // +2 mins buffer
  return Math.max(3, minutes);
}

/**
 * Checks if a rider's last known location update is older than the staleness threshold (default 10 minutes).
 */
export function isRiderLocationStale(rider?: PickupBoy | null, maxAgeMinutes: number = 10): boolean {
  if (!rider) return true;
  if (!rider.isOnline && rider.status !== 'active') return true;

  const rawTimestamp = rider.lastUpdated || rider.currentLocation?.timestamp || rider.lastPingTime;
  if (!rawTimestamp) return true;

  let timestampMs = 0;
  if (typeof rawTimestamp === 'object' && typeof rawTimestamp.toMillis === 'function') {
    timestampMs = rawTimestamp.toMillis();
  } else if (typeof rawTimestamp === 'object' && typeof rawTimestamp.seconds === 'number') {
    timestampMs = rawTimestamp.seconds * 1000;
  } else if (typeof rawTimestamp === 'number') {
    timestampMs = rawTimestamp;
  } else if (typeof rawTimestamp === 'string') {
    timestampMs = new Date(rawTimestamp).getTime();
  }

  if (isNaN(timestampMs) || timestampMs <= 0) return true;

  const diffMinutes = (Date.now() - timestampMs) / (1000 * 60);
  return diffMinutes > maxAgeMinutes;
}

export interface GpsStatusEvent {
  isActive: boolean;
  mode: 'real' | 'simulated' | 'idle';
  isPermissionDenied: boolean;
  errorCode: number | null;
  errorMessage: string | null;
  lastPingTime: string | null;
}

class LocationTrackerService {
  private watchId: number | null = null;
  private simulationInterval: any = null;
  private simIndex: number = 0;
  private isSimulating: boolean = false;
  
  // Throttling state: 10 seconds or 25 meters
  private lastSentTimestamp: number = 0;
  private lastSentCoords: { lat: number; lng: number } | null = null;
  
  // GPS Permission & Error state
  private isPermissionDenied: boolean = false;
  private lastErrorCode: number | null = null;
  private lastErrorMessage: string | null = null;

  private listeners: Array<(ping: LocationPing) => void> = [];
  private statusListeners: Array<(status: GpsStatusEvent) => void> = [];

  public subscribe(callback: (ping: LocationPing) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  public subscribeStatus(callback: (status: GpsStatusEvent) => void) {
    this.statusListeners.push(callback);
    // Send current status immediately
    callback(this.getStatus());
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== callback);
    };
  }

  public getStatus(): GpsStatusEvent {
    return {
      isActive: this.watchId !== null || this.isSimulating,
      mode: this.watchId !== null ? 'real' : this.isSimulating ? 'simulated' : 'idle',
      isPermissionDenied: this.isPermissionDenied,
      errorCode: this.lastErrorCode,
      errorMessage: this.lastErrorMessage,
      lastPingTime: this.lastSentCoords ? new Date(this.lastSentTimestamp).toISOString() : null
    };
  }

  private notifyStatus() {
    const status = this.getStatus();
    this.statusListeners.forEach((fn) => fn(status));
  }

  private notify(ping: LocationPing) {
    this.listeners.forEach((fn) => fn(ping));
  }

  /**
   * Start real browser geolocation watch
   * Configured with { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
   * Throttles writes to Firestore every 10 seconds OR if moved > 25 meters.
   */
  public startRealGeolocation(riderId: string, riderName: string, taskId?: string) {
    this.stop();
    this.isPermissionDenied = false;
    this.lastErrorCode = null;
    this.lastErrorMessage = null;

    if (!navigator.geolocation) {
      this.lastErrorMessage = 'Geolocation is not supported by this browser';
      this.lastErrorCode = 2;
      this.notifyStatus();
      this.startSimulation(riderId, riderName, taskId);
      return;
    }

    try {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.isPermissionDenied = false;
          this.lastErrorCode = null;
          this.lastErrorMessage = null;

          const currentLat = pos.coords.latitude;
          const currentLng = pos.coords.longitude;
          const currentHeading = pos.coords.heading || 0;
          const currentSpeed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
          const now = Date.now();

          let movedMeters = 0;
          if (this.lastSentCoords) {
            movedMeters = calculateDistanceMeters(
              this.lastSentCoords.lat,
              this.lastSentCoords.lng,
              currentLat,
              currentLng
            );
          }

          const timeElapsedMs = now - this.lastSentTimestamp;
          // Throttle: write to Firestore every 10s OR if moved > 25 meters (or on first ping)
          const shouldWrite = !this.lastSentCoords || timeElapsedMs >= 10000 || movedMeters >= 25;

          const ping: LocationPing = {
            id: `ping-${Date.now()}`,
            riderId,
            riderName,
            timestamp: new Date().toISOString(),
            lat: currentLat,
            lng: currentLng,
            speed: currentSpeed,
            heading: currentHeading,
            battery: 90,
            taskId
          };

          if (shouldWrite) {
            this.lastSentTimestamp = now;
            this.lastSentCoords = { lat: currentLat, lng: currentLng };
            this.recordPing(ping);
          } else {
            // Local broadcast only without writing to Firestore
            this.notify(ping);
          }

          this.notifyStatus();
        },
        (err) => {
          console.warn('[LocationService] Geolocation watch error:', err.code, err.message);
          this.lastErrorCode = err.code;
          if (err.code === 1) { // PERMISSION_DENIED
            this.isPermissionDenied = true;
            this.lastErrorMessage = 'Location permission denied. Please allow GPS location access in your browser settings to broadcast live telemetry.';
          } else if (err.code === 2) { // POSITION_UNAVAILABLE
            this.lastErrorMessage = 'GPS position unavailable. Please enable device location / GPS services.';
          } else if (err.code === 3) { // TIMEOUT
            this.lastErrorMessage = 'GPS location request timed out. Retrying high-accuracy signal...';
          } else {
            this.lastErrorMessage = err.message || 'Unknown GPS error';
          }

          this.notifyStatus();
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000
        }
      );

      this.notifyStatus();
    } catch (e: any) {
      console.warn('[LocationService] Exception starting watchPosition:', e);
      this.lastErrorMessage = e?.message || 'Failed to start GPS tracking';
      this.notifyStatus();
    }
  }

  /**
   * Start continuous simulated rider route movement for test demonstration
   */
  public startSimulation(riderId: string, riderName: string, taskId?: string) {
    this.stop();
    this.isSimulating = true;
    this.isPermissionDenied = false;
    this.lastErrorCode = null;
    this.lastErrorMessage = null;

    // Initial ping
    const initialWay = DEMO_ROUTE_WAYPOINTS[this.simIndex % DEMO_ROUTE_WAYPOINTS.length];
    const initialPing: LocationPing = {
      id: `sim-ping-${Date.now()}`,
      riderId,
      riderName,
      timestamp: new Date().toISOString(),
      lat: initialWay.lat + (Math.random() - 0.5) * 0.0008,
      lng: initialWay.lng + (Math.random() - 0.5) * 0.0008,
      speed: 28,
      heading: 175,
      battery: 88,
      taskId
    };
    this.lastSentTimestamp = Date.now();
    this.lastSentCoords = { lat: initialPing.lat, lng: initialPing.lng };
    this.recordPing(initialPing);
    this.notifyStatus();

    this.simulationInterval = setInterval(() => {
      this.simIndex = (this.simIndex + 1) % DEMO_ROUTE_WAYPOINTS.length;
      const way = DEMO_ROUTE_WAYPOINTS[this.simIndex];
      // Add slight jitter for realistic micro-movement
      const jitterLat = (Math.random() - 0.5) * 0.0006;
      const jitterLng = (Math.random() - 0.5) * 0.0006;

      const ping: LocationPing = {
        id: `sim-ping-${Date.now()}`,
        riderId,
        riderName,
        timestamp: new Date().toISOString(),
        lat: way.lat + jitterLat,
        lng: way.lng + jitterLng,
        speed: Math.floor(20 + Math.random() * 15),
        heading: Math.floor(Math.random() * 360),
        battery: Math.max(20, 92 - Math.floor(this.simIndex * 0.5)),
        taskId
      };

      this.lastSentTimestamp = Date.now();
      this.lastSentCoords = { lat: ping.lat, lng: ping.lng };
      this.recordPing(ping);
    }, 10000); // 10s interval for simulated throttle
  }

  public stepSimulationManually(riderId: string, riderName: string, taskId?: string) {
    this.simIndex = (this.simIndex + 1) % DEMO_ROUTE_WAYPOINTS.length;
    const way = DEMO_ROUTE_WAYPOINTS[this.simIndex];
    const ping: LocationPing = {
      id: `manual-ping-${Date.now()}`,
      riderId,
      riderName,
      timestamp: new Date().toISOString(),
      lat: way.lat,
      lng: way.lng,
      speed: 26,
      heading: 180,
      battery: 85,
      taskId
    };
    this.lastSentTimestamp = Date.now();
    this.lastSentCoords = { lat: ping.lat, lng: ping.lng };
    this.recordPing(ping);
  }

  private recordPing(ping: LocationPing) {
    StorageService.addPing(ping);

    // Update rider's active location in storage
    const rider = StorageService.getRiderById(ping.riderId);
    if (rider) {
      const updatedRider: PickupBoy = {
        ...rider,
        currentLocation: {
          lat: ping.lat,
          lng: ping.lng,
          timestamp: ping.timestamp,
          heading: ping.heading,
          accuracy: 5
        },
        heading: ping.heading || 0,
        batteryLevel: ping.battery,
        isOnline: true,
        lastPingTime: ping.timestamp
      };
      StorageService.updateRider(updatedRider);
    }

    // Sync to Firestore 'locations' and update 'riders/{riderId}' with currentLocation, heading, lastUpdated serverTimestamp
    CloudSync.recordLocationPing(ping).catch((err) => {
      console.warn('[LocationService] Firestore location sync notice:', err);
    });

    this.notify(ping);
  }

  public startTracking(callbackOrRiderId?: ((ping: LocationPing) => void) | string, riderName?: string, taskId?: string) {
    if (typeof callbackOrRiderId === 'function') {
      this.subscribe(callbackOrRiderId);
      // Auto start tracking with active rider
      const riders = StorageService.getRiders();
      const activeRider = riders.find((r) => r.status === 'active') || riders[0];
      if (activeRider) {
        this.startRealGeolocation(activeRider.id, activeRider.name);
      }
    } else if (typeof callbackOrRiderId === 'string' && riderName) {
      this.startRealGeolocation(callbackOrRiderId, riderName, taskId);
    }
  }

  public stop() {
    if (this.watchId !== null) {
      navigator.geolocation?.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.simulationInterval !== null) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    this.isSimulating = false;
    this.notifyStatus();
  }

  public stopSimulation() {
    this.stop();
  }

  public getIsSimulating(): boolean {
    return this.isSimulating;
  }
}

export const LocationService = new LocationTrackerService();
