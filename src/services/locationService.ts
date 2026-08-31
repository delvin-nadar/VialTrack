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

// Calculate ETA in minutes based on distance and average Mumbai city bike speed (25 km/h)
export function calculateEtaMinutes(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const distKm = calculateDistanceKm(fromLat, fromLng, toLat, toLng);
  const avgSpeedKmh = 24; // avg bike speed in traffic
  const hours = distKm / avgSpeedKmh;
  const minutes = Math.ceil(hours * 60) + 2; // +2 mins buffer
  return Math.max(3, minutes);
}

class LocationTrackerService {
  private watchId: number | null = null;
  private simulationInterval: any = null;
  private simIndex: number = 0;
  private isSimulating: boolean = false;
  private listeners: Array<(ping: LocationPing) => void> = [];

  public subscribe(callback: (ping: LocationPing) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notify(ping: LocationPing) {
    this.listeners.forEach((fn) => fn(ping));
  }

  /**
   * Start real browser geolocation watch
   */
  public startRealGeolocation(riderId: string, riderName: string, taskId?: string) {
    this.stop();
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser');
      this.startSimulation(riderId, riderName, taskId);
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const ping: LocationPing = {
          id: `ping-${Date.now()}`,
          riderId,
          riderName,
          timestamp: new Date().toISOString(),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0,
          heading: pos.coords.heading || 0,
          battery: 90,
          taskId
        };
        this.recordPing(ping);
      },
      (err) => {
        console.warn('GPS watch error, falling back to live simulator:', err.message);
        this.startSimulation(riderId, riderName, taskId);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );
  }

  /**
   * Start continuous simulated rider route movement for test demonstration
   */
  public startSimulation(riderId: string, riderName: string, taskId?: string) {
    this.stop();
    this.isSimulating = true;

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
    this.recordPing(initialPing);

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

      this.recordPing(ping);
    }, 4000); // update every 4 seconds in demo mode
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
        batteryLevel: ping.battery,
        isOnline: true,
        lastPingTime: ping.timestamp
      };
      StorageService.updateRider(updatedRider);
    }

    // Sync to Firestore 'locations' and 'riders' with GeoPoint
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
  }

  public stopSimulation() {
    this.stop();
  }

  public getIsSimulating(): boolean {
    return this.isSimulating;
  }
}

export const LocationService = new LocationTrackerService();
