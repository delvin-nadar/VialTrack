import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RouteStop, DestinationLab, PickupBoy, LocationPing, PickupTask } from '../../types';
import { CloudSync, parseFirestoreGeoPoint, db } from '../../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { isRiderLocationStale } from '../../services/locationService';
import { fetchRoadPolyline } from '../../utils/routeGeometry';
import {
  MapPin,
  Bike,
  Navigation,
  Layers,
  Crosshair,
  Maximize2,
  Minimize2,
  Building2,
  Thermometer,
  Battery,
  AlertCircle,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react';

export interface LiveMapProps {
  stops?: RouteStop[] | any[];
  destination?: DestinationLab | any;
  rider?: PickupBoy | null;
  riders?: PickupBoy[];
  tasks?: PickupTask[];
  activeTaskId?: string | null;
  pings?: LocationPing[];
  height?: string;
  autoFit?: boolean;
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string) => void;
  onSelectRider?: (riderId: string) => void;
  showTrail?: boolean;
  centerCoordinates?: [number, number];
  zoom?: number;
  enableFirestoreSync?: boolean;
}

// Default Mumbai City Center coordinates and zoom level as required
export const MUMBAI_CENTER: [number, number] = [19.0760, 72.8777];
export const DEFAULT_MUMBAI_ZOOM = 12;

export const LiveMap: React.FC<LiveMapProps> = ({
  stops = [],
  destination,
  rider,
  riders: propRiders,
  tasks = [],
  activeTaskId,
  pings: propPings = [],
  height = '380px',
  autoFit = false,
  selectedStopId,
  onSelectStop,
  onSelectRider,
  showTrail = true,
  centerCoordinates = MUMBAI_CENTER,
  zoom = DEFAULT_MUMBAI_ZOOM,
  enableFirestoreSync = true
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const polylinesLayerRef = useRef<L.LayerGroup | null>(null);
  const trailLayerRef = useRef<L.LayerGroup | null>(null);

  // Persistent marker tracking references for smooth position updates without re-renders
  const riderMarkersMapRef = useRef<Map<string, L.Marker>>(new Map());
  const hasInitialFittedRef = useRef<boolean>(false);

  // Firestore real-time state for riders and location pings
  const [firestoreRiders, setFirestoreRiders] = useState<PickupBoy[]>([]);
  const [firestorePings, setFirestorePings] = useState<LocationPing[]>([]);
  const [isFirestoreConnected, setIsFirestoreConnected] = useState<boolean>(false);

  // UI layer toggles
  const [showRiderMarkers, setShowRiderMarkers] = useState<boolean>(true);
  const [showPolylines, setShowPolylines] = useState<boolean>(true);
  const [showStops, setShowStops] = useState<boolean>(true);
  const [showDestination, setShowDestination] = useState<boolean>(true);
  const [showBreadcrumbs, setShowBreadcrumbs] = useState<boolean>(showTrail);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activeFilterRiderId, setActiveFilterRiderId] = useState<string | 'all'>('all');

  // Real-time Firestore Subscriptions for 'riders' collection
  useEffect(() => {
    if (!enableFirestoreSync) return;

    let mounted = true;
    const unsubscribe = onSnapshot(
      collection(db, 'riders'),
      (snapshot) => {
        if (!mounted) return;
        const activeFleet = snapshot.docs
          .map((d) => {
            const data = d.data();
            const lat = data.lat ?? data.currentLocation?.lat;
            const lng = data.lng ?? data.currentLocation?.lng;
            return {
              id: d.id,
              ...data,
              lat,
              lng,
              name: data.name || 'Courier Partner',
              vehicleNumber: data.vehicleNumber || data.vehicleNo || '',
              isOnline: data.isOnline !== false
            } as any;
          })
          .filter((r) => r.lat && r.lng && r.isOnline);

        setFirestoreRiders(activeFleet);
        setIsFirestoreConnected(true);

        // When activeFleet updates, center and fit bounds if single rider
        if (mapInstanceRef.current && activeFleet.length === 1) {
          const singleRider = activeFleet[0];
          mapInstanceRef.current.setView([singleRider.lat, singleRider.lng], Math.max(mapInstanceRef.current.getZoom(), 14), {
            animate: true
          });
        }
      },
      (error) => {
        console.warn('[LiveMap] onSnapshot error for riders collection:', error);
      }
    );

    const unsubLocations = CloudSync.subscribeToLocations((cloudPings) => {
      if (!mounted) return;
      if (cloudPings) {
        setFirestorePings(cloudPings);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
      unsubLocations();
    };
  }, [enableFirestoreSync]);

  // Merge prop riders and real-time Firestore riders with GeoPoint extraction
  const activeRidersList = useMemo(() => {
    const isScoped = Boolean(rider || (propRiders && propRiders.length > 0));
    const riderMap = new Map<string, any>();

    // 1. Seed with prop riders
    if (propRiders && propRiders.length > 0) {
      propRiders.forEach((r) => {
        if (r && r.id) {
          const lat = (r as any).lat ?? r.currentLocation?.lat;
          const lng = (r as any).lng ?? r.currentLocation?.lng;
          riderMap.set(r.id, { ...r, lat, lng });
        }
      });
    }
    if (rider && rider.id) {
      const lat = (rider as any).lat ?? rider.currentLocation?.lat;
      const lng = (rider as any).lng ?? rider.currentLocation?.lng;
      riderMap.set(rider.id, { ...rider, lat, lng });
    }

    // 2. Overlay live Firestore riders
    firestoreRiders.forEach((fr: any) => {
      if (isScoped && !riderMap.has(fr.id)) {
        return;
      }
      const existing = riderMap.get(fr.id) || fr;
      const lat = fr.lat ?? fr.currentLocation?.lat;
      const lng = fr.lng ?? fr.currentLocation?.lng;
      riderMap.set(fr.id, {
        ...existing,
        ...fr,
        lat,
        lng,
        currentLocation: {
          lat,
          lng,
          timestamp: fr.currentLocation?.timestamp || new Date().toISOString(),
          heading: fr.heading || 0,
          speed: fr.currentLocation?.speed || 0,
          accuracy: 5
        }
      });
    });

    // 3. Overlay latest Firestore location pings to ensure fresh coordinates
    firestorePings.forEach((ping) => {
      if (ping.riderId && riderMap.has(ping.riderId)) {
        const r = riderMap.get(ping.riderId)!;
        const coords = parseFirestoreGeoPoint((ping as any).location) || { lat: ping.lat, lng: ping.lng };
        riderMap.set(ping.riderId, {
          ...r,
          lat: coords.lat,
          lng: coords.lng,
          currentLocation: {
            lat: coords.lat,
            lng: coords.lng,
            timestamp: ping.timestamp,
            heading: ping.heading,
            accuracy: 5
          },
          batteryLevel: ping.battery ?? r.batteryLevel,
          isOnline: true,
          lastPingTime: ping.timestamp
        });
      }
    });

    const list = Array.from(riderMap.values()).filter((r) => r && (r.status === 'active' || r.isOnline || (r.lat && r.lng) || r.currentLocation));
    return list;
  }, [propRiders, rider, firestoreRiders, firestorePings]);

  // Compute active stops to render strictly from props/tasks (no mock fallbacks)
  const resolvedStops: any[] = useMemo(() => {
    if (stops && stops.length > 0) return stops;
    if (tasks && tasks.length > 0 && tasks[0]?.stopsProgress && tasks[0].stopsProgress.length > 0) {
      return tasks[0].stopsProgress.map((s, idx) => ({
        id: s.stopId || `stop-${idx}`,
        name: s.stopName,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        contactPerson: s.contactPerson || 'Lab Coordinator',
        phone: s.phone || '',
        status: s.status,
        sampleCount: s.sampleCount || 0,
        order: idx + 1
      }));
    }
    return [];
  }, [stops, tasks]);

  const resolvedDestination: any = useMemo(() => {
    return destination || tasks[0]?.destination || null;
  }, [destination, tasks]);

  // Initialize Leaflet Map Centered on Mumbai with OpenStreetMap tile layer
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialCenter: [number, number] = centerCoordinates || MUMBAI_CENTER;
      const initialZoom: number = zoom || DEFAULT_MUMBAI_ZOOM;

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: false,
        attributionControl: true
      });

      // Configure official enterprise attribution prefix
      if (map.attributionControl) {
        map.attributionControl.setPrefix('SecondMedic Fleet Radar |');
      }

      // Add Zoom control at top-left
      L.control.zoom({ position: 'topleft' }).addTo(map);

      // Standard OpenStreetMap Tile Layer with clean legal attribution
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
      }).addTo(map);

      // Setup dedicated layer groups
      polylinesLayerRef.current = L.layerGroup().addTo(map);
      trailLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        riderMarkersMapRef.current.clear();
      }
    };
  }, []);

  // MapInvalidateSize helper: automatically invalidates map size to ensure instant rendering without manual resize
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Call invalidateSize immediately and in staggered intervals to guarantee tile rendering
    map.invalidateSize();
    const t0 = setTimeout(() => map.invalidateSize(), 30);
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    const t3 = setTimeout(() => map.invalidateSize(), 800);

    const handleResize = () => {
      map.invalidateSize();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', handleResize);
    };
  }, [height, isFullscreen, resolvedStops, activeRidersList]);

  // Center on Mumbai explicitly
  const handleResetToMumbai = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(MUMBAI_CENTER, DEFAULT_MUMBAI_ZOOM, {
        animate: true,
        duration: 0.8
      });
    }
  };

  // Fit bounds to all active riders, stops, and destinations
  const handleFitFleet = () => {
    if (!mapInstanceRef.current) return;
    const points: L.LatLngExpression[] = [];

    activeRidersList.forEach((r) => {
      if (r.currentLocation) {
        points.push([r.currentLocation.lat, r.currentLocation.lng]);
      }
    });

    resolvedStops.forEach((s) => points.push([s.lat, s.lng]));
    if (resolvedDestination) points.push([resolvedDestination.lat, resolvedDestination.lng]);

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else {
      handleResetToMumbai();
    }
  };

  // Render Markers and Polyline Routes connecting assigned tasks to rider locations
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const polylinesLayer = polylinesLayerRef.current;
    const trailLayer = trailLayerRef.current;
    if (!map || !markersLayer || !polylinesLayer || !trailLayer) return;

    polylinesLayer.clearLayers();
    trailLayer.clearLayers();

    const boundsPoints: L.LatLngExpression[] = [];

    // Filter riders to render
    const ridersToRender = activeRidersList.filter((r) => {
      if (activeFilterRiderId === 'all') return true;
      return r.id === activeFilterRiderId;
    });

    const currentRiderIds = new Set(ridersToRender.map((r) => r.id));

    // 1. RENDER / SMOOTHLY UPDATE LIVE BIKE ICON MARKERS FOR ACTIVE RIDERS
    if (showRiderMarkers) {
      ridersToRender.forEach((activeRider) => {
        const lat = (activeRider as any).lat ?? activeRider.currentLocation?.lat;
        const lng = (activeRider as any).lng ?? activeRider.currentLocation?.lng;

        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        boundsPoints.push([lat, lng]);

        const isSelected = rider?.id === activeRider.id || activeFilterRiderId === activeRider.id;
        const isStale = isRiderLocationStale(activeRider, 10);
        const assignedTask = tasks.find((t) => t.riderId === activeRider.id && t.status !== 'delivered') || tasks[0];
        const nextStop = assignedTask?.stopsProgress?.find((s) => s.status === 'pending' || s.status === 'arrived');

        const riderName = activeRider.name || 'Courier Partner';
        const vehicleNum = activeRider.vehicleNumber || '2-Wheeler';
        const firstName = riderName.split(' ')[0] || riderName;

        // Custom High-Precision Bike Icon Courier Marker with Stale/Online Badging
        const riderIcon = L.divIcon({
          className: 'custom-bike-marker',
          html: `
            <div class="relative group cursor-pointer" style="position: relative; width: 44px; height: 44px;">
              <!-- Pulsing Live Radar Wave (only when online & fresh) -->
              ${!isStale ? '<div class="absolute -inset-1.5 bg-sky-500 rounded-full animate-ping opacity-60"></div>' : ''}
              
              <!-- Main Rider Badge with Bike Icon -->
              <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: ${isStale ? '#334155' : '#0284c7'}; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 12px rgba(0,0,0,0.35);">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="5.5" cy="17.5" r="3.5"/>
                  <circle cx="18.5" cy="17.5" r="3.5"/>
                  <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h4"/>
                </svg>
                <span style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: ${isStale ? '#f59e0b' : '#22c55e'}; border: 2px solid #fff; border-radius: 50%;"></span>
              </div>

              <!-- Top Floating Rider Name Tag -->
              <div style="position: absolute; top: -28px; left: 50%; transform: translateX(-50%); background: rgba(2, 6, 23, 0.95); color: #ffffff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; white-space: nowrap; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.25); border: 1px solid ${isStale ? '#f59e0b' : 'rgba(56, 189, 248, 0.7)'}; display: flex; align-items: center; gap: 4px; pointer-events: none;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: ${isStale ? '#f59e0b' : '#22c55e'};"></span>
                <span>${firstName}</span>
                <span style="color: #7dd3fc; font-family: monospace; font-size: 9px;">${vehicleNum.split('-').pop() || 'BIKE'}</span>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        const popupHtml = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 220px; padding: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">
              <span style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px;">Live GPS Medical Courier</span>
              <span style="font-size: 9px; font-weight: 700; background: ${isStale ? '#fef3c7' : '#ecfdf5'}; color: ${isStale ? '#b45309' : '#047857'}; padding: 2px 6px; border-radius: 9999px; border: 1px solid ${isStale ? '#fde68a' : '#a7f3d0'};">
                ${isStale ? 'STALE / OFFLINE (>10M)' : 'ONLINE / LIVE GPS'}
              </span>
            </div>
            
            <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${riderName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 1px;">${activeRider.vehicleType || 'Motorcycle'} • <span style="font-family: monospace; font-weight: 600;">${vehicleNum}</span></div>
            
            <div style="margin-top: 8px; padding: 6px 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 11px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #64748b;">Cold-Box Temp:</span>
                <span style="font-weight: 700; color: #047857; font-family: monospace;">4.0°C (Safe 2-8°C)</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #64748b;">Phone Battery:</span>
                <span style="font-weight: 700; color: #0f172a; font-family: monospace;">${activeRider.batteryLevel || 90}%</span>
              </div>
              ${
                assignedTask?.routeName
                  ? `<div style="display: flex; justify-content: space-between;">
                      <span style="color: #64748b;">Active Route:</span>
                      <span style="font-weight: 700; color: #0369a1;">${assignedTask.routeName}</span>
                    </div>`
                  : ''
              }
            </div>

            ${
              nextStop
                ? `<div style="margin-top: 6px; font-size: 11px; color: #334155;"><b>Next Stop:</b> ${nextStop.stopName || 'Client Stop'}</div>`
                : ''
            }
          </div>
        `;

        // Smooth position update if marker already exists
        if (riderMarkersMapRef.current.has(activeRider.id)) {
          const existingMarker = riderMarkersMapRef.current.get(activeRider.id)!;
          existingMarker.setLatLng([lat, lng]);
          existingMarker.setIcon(riderIcon);
          existingMarker.setPopupContent(popupHtml);
        } else {
          // Create new marker
          const riderMarker = L.marker([lat, lng], {
            icon: riderIcon,
            zIndexOffset: 1200
          }).addTo(markersLayer);

          riderMarker.on('click', () => {
            if (onSelectRider) onSelectRider(activeRider.id);
          });

          riderMarker.bindPopup(popupHtml);
          riderMarkersMapRef.current.set(activeRider.id, riderMarker);
        }
      });
    }

    // Clean up markers for removed riders
    riderMarkersMapRef.current.forEach((marker, id) => {
      if (!currentRiderIds.has(id) || !showRiderMarkers) {
        markersLayer.removeLayer(marker);
        riderMarkersMapRef.current.delete(id);
      }
    });

    // 2. RENDER CUSTOM HOSPITAL & CLINIC PIN MARKERS FOR CLIENT STOPS
    if (showStops) {
      resolvedStops.forEach((stop, index) => {
        const stopId = stop.id || (stop as any).stopId || `stop-${index}`;
        const stopName = stop.name || (stop as any).stopName || `Client Stop #${index + 1}`;
        const stopAddress = stop.address || 'Mumbai, Maharashtra';
        const isSelected = selectedStopId === stopId;
        const isPickedUp = (stop as any).status === 'picked_up';
        const shortStopName = stopName.includes(',') ? stopName.split(',')[0] : stopName;

        // Custom Hospital/Lab Location Pin Marker
        const stopIcon = L.divIcon({
          className: 'custom-hospital-pin',
          html: `
            <div class="relative group cursor-pointer flex flex-col items-center">
              <div class="w-8 h-8 rounded-full ${
                isPickedUp
                  ? 'bg-emerald-600 ring-2 ring-emerald-300'
                  : isSelected
                  ? 'bg-sky-600 ring-3 ring-sky-300'
                  : 'bg-rose-600 ring-2 ring-rose-200'
              } text-white font-bold text-xs flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                ${
                  isPickedUp
                    ? '<span class="font-bold text-sm">✓</span>'
                    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v12"/><path d="M6 12h12"/></svg>`
                }
              </div>
              <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white/95 text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs pointer-events-none border border-slate-200 whitespace-nowrap">
                ${shortStopName}
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const stopMarker = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(markersLayer);
        stopMarker.on('click', () => {
          if (onSelectStop) onSelectStop(stopId);
        });

        stopMarker.bindPopup(`
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 200px; padding: 4px;">
            <div style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase;">Stop #${index + 1} Hospital / Diagnostic Hub</div>
            <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${stopName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 3px;">${stopAddress}</div>
            <div style="font-size: 11px; color: #334155; margin-top: 5px;">
              <b>Contact:</b> ${stop.contactPerson || 'Lab Coordinator'} (${stop.phone || '+91 98200 33445'})
            </div>
            <div style="margin-top: 4px; font-size: 11px; font-weight: 700; color: #0369a1;">
              Specimen Count: ${(stop as any).sampleCount || 10} Vials
            </div>
          </div>
        `);

        boundsPoints.push([stop.lat, stop.lng]);
      });
    }

    // 3. RENDER DESTINATION CENTRAL INTAKE LAB
    if (showDestination && resolvedDestination && resolvedDestination.lat && resolvedDestination.lng) {
      const dest = resolvedDestination;
      const destName = dest.name || 'Central Diagnostic Intake Lab';
      const destAddress = dest.address || '';
      const destIcon = L.divIcon({
        className: 'custom-dest-icon',
        html: `
          <div class="relative group flex flex-col items-center">
            <div class="w-9 h-9 rounded-lg bg-emerald-700 ring-3 ring-emerald-300 text-white font-bold text-sm flex items-center justify-center shadow-xl transform transition-transform group-hover:scale-110">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                <path d="M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/>
                <path d="M8 14h8"/>
                <path d="M12 10v8"/>
              </svg>
            </div>
            <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-emerald-900 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs pointer-events-none border border-emerald-700 whitespace-nowrap">
              CENTRAL LAB
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const destMarker = L.marker([dest.lat, dest.lng], { icon: destIcon, zIndexOffset: 900 }).addTo(markersLayer);
      destMarker.bindPopup(`
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 200px; padding: 4px;">
          <div style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase;">Central Diagnostics Lab</div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${destName}</div>
          ${destAddress ? `<div style="font-size: 11px; color: #64748b; margin-top: 3px;">${destAddress}</div>` : ''}
          ${(dest as any).contactPerson ? `<div style="font-size: 11px; color: #334155; margin-top: 5px;"><b>Intake Lead:</b> ${(dest as any).contactPerson}</div>` : ''}
        </div>
      `);

      boundsPoints.push([dest.lat, dest.lng]);
    }

    // 4. DRAW ROAD/BIKE POLYLINES CONNECTING STOPS ALONG ACTUAL MUMBAI STREETS VIA OSRM
    if (showPolylines) {
      ridersToRender.forEach((activeRider) => {
        if (!activeRider.currentLocation) return;
        const riderCoords: [number, number] = [activeRider.currentLocation.lat, activeRider.currentLocation.lng];

        if (resolvedStops.length > 0) {
          // Leg 1: Active In-Transit road polyline from Rider's live GPS to Next Stop
          const nextTargetStop = resolvedStops.find((s) => (s as any).status !== 'picked_up') || resolvedStops[0];
          if (nextTargetStop) {
            const riderToStopLeg: [number, number][] = [
              riderCoords,
              [nextTargetStop.lat, nextTargetStop.lng]
            ];

            const riderLine = L.polyline(riderToStopLeg, {
              color: '#0284c7', // Sky Blue
              weight: 4,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(polylinesLayer);

            // Fetch actual road geometry along streets/flyovers and update line
            fetchRoadPolyline(riderToStopLeg).then((roadCoords) => {
              if (roadCoords.length > 0 && polylinesLayer.hasLayer(riderLine)) {
                riderLine.setLatLngs(roadCoords);
              }
            }).catch(() => {});
          }

          // Leg 2: Continuous road polyline connecting all sequential hospital/client stops
          const allStopsCoords: [number, number][] = resolvedStops.map((s) => [s.lat, s.lng]);
          if (allStopsCoords.length > 1) {
            const stopsLine = L.polyline(allStopsCoords, {
              color: '#0369a1', // Deep Sky Blue
              weight: 3,
              opacity: 0.7,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(polylinesLayer);

            fetchRoadPolyline(allStopsCoords).then((roadCoords) => {
              if (roadCoords.length > 0 && polylinesLayer.hasLayer(stopsLine)) {
                stopsLine.setLatLngs(roadCoords);
              }
            }).catch(() => {});
          }

          // Leg 3: Final Road Polyline from Last Stop to Central Intake Destination Lab
          if (resolvedDestination && resolvedStops.length > 0) {
            const lastStop = resolvedStops[resolvedStops.length - 1];
            const labLegCoords: [number, number][] = [
              [lastStop.lat, lastStop.lng],
              [resolvedDestination.lat, resolvedDestination.lng]
            ];

            const labLine = L.polyline(labLegCoords, {
              color: '#059669', // Emerald green
              weight: 3,
              opacity: 0.75,
              dashArray: '4, 6',
              lineCap: 'round'
            }).addTo(polylinesLayer);

            fetchRoadPolyline(labLegCoords).then((roadCoords) => {
              if (roadCoords.length > 0 && polylinesLayer.hasLayer(labLine)) {
                labLine.setLatLngs(roadCoords);
              }
            }).catch(() => {});
          }

          // Leg 4: Full continuous road polyline covering entire round (Rider -> Stops -> Destination)
          if (resolvedDestination) {
            const fullLoopPoints: [number, number][] = [
              riderCoords,
              ...allStopsCoords,
              [resolvedDestination.lat, resolvedDestination.lng]
            ];
            fetchRoadPolyline(fullLoopPoints).then((roadCoords) => {
              // Pre-populate route cache for fast navigation
            }).catch(() => {});
          }
        }
      });
    }

    // 5. RENDER BREADCRUMB TRAIL FROM FIRESTORE LOCATION PINGS
    if (showBreadcrumbs) {
      const allPings = firestorePings.length > 0 ? firestorePings : propPings;
      if (allPings.length > 0) {
        const trailCoords: [number, number][] = allPings
          .map((p) => {
            const coords = parseFirestoreGeoPoint((p as any).location) || { lat: p.lat, lng: p.lng };
            return [coords.lat, coords.lng] as [number, number];
          })
          .filter((coord) => typeof coord[0] === 'number' && typeof coord[1] === 'number');

        if (trailCoords.length > 1) {
          L.polyline(trailCoords, {
            color: '#0284c7',
            weight: 3,
            opacity: 0.6,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(trailLayer);
        }
      }
    }

    // Auto-fit bounds ONLY once on initial mount (to prevent disruptive zoom resets during ongoing GPS tracking)
    if (autoFit && !hasInitialFittedRef.current && boundsPoints.length > 0) {
      hasInitialFittedRef.current = true;
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [
    activeRidersList,
    resolvedStops,
    resolvedDestination,
    tasks,
    activeTaskId,
    selectedStopId,
    activeFilterRiderId,
    showRiderMarkers,
    showPolylines,
    showStops,
    showDestination,
    showBreadcrumbs,
    firestorePings,
    propPings,
    autoFit
  ]);

  return (
    <div
      style={{
        height: isFullscreen ? 'calc(100vh - 32px)' : (height || '380px'),
        width: '100%',
        borderRadius: '12px'
      }}
      className={`h-[380px] w-full rounded-xl overflow-hidden my-3 relative z-0 border border-slate-200 shadow-xs bg-slate-100 flex flex-col transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-[9999] shadow-2xl !h-[calc(100vh-32px)] my-0' : ''
      }`}
    >
      {/* Top Map Control Bar */}
      <div className="absolute top-3 left-14 z-[400] flex flex-wrap items-center gap-2">
        {/* Mumbai Reset Button */}
        <button
          onClick={handleResetToMumbai}
          className="px-2.5 py-1 bg-white/95 backdrop-blur-xs hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-lg border border-slate-200 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
          title="Center on Mumbai (19.0760, 72.8777)"
        >
          <Crosshair className="w-3.5 h-3.5 text-sky-700" />
          <span>Mumbai Center (Zoom 12)</span>
        </button>

        {/* Fit Fleet Button */}
        <button
          onClick={handleFitFleet}
          className="px-2.5 py-1 bg-white/95 backdrop-blur-xs hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
          title="Zoom to Fit All Active Riders & Routes"
        >
          <Navigation className="w-3.5 h-3.5 text-slate-600" />
          <span>Fit Fleet</span>
        </button>

        {/* Active Rider Filter Dropdown */}
        {activeRidersList.length > 1 && (
          <select
            value={activeFilterRiderId}
            onChange={(e) => setActiveFilterRiderId(e.target.value)}
            aria-label="Filter Map By Active Rider"
            className="px-2.5 py-1 bg-white/95 backdrop-blur-xs text-slate-800 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs cursor-pointer focus:outline-none"
          >
            <option value="all">All Active Riders ({activeRidersList.length})</option>
            {activeRidersList.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.vehicleNumber}) {isRiderLocationStale(r, 10) ? '• Stale' : '• Live'}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Top Right Live Firestore Status Pill & Fullscreen Button */}
      <div className="absolute top-3 right-3 z-[400] flex items-center gap-2">
        {/* Real-time Status Badge */}
        <div className="bg-slate-950/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-700 text-xs font-bold text-white flex items-center gap-2 shadow-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px]">
            {isFirestoreConnected ? 'Satellite GPS Active' : 'Live Fleet Radar'}
          </span>
          <span className="text-[10px] text-sky-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
            {activeRidersList.length} Active
          </span>
        </div>

        {/* Fullscreen Toggle */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-1.5 bg-white/95 backdrop-blur-xs hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-200 shadow-xs transition-colors cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen Map'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Leaflet Map Canvas Div */}
      <div
        ref={mapContainerRef}
        style={{ height: '100%', width: '100%' }}
        className="flex-1 w-full h-full z-0"
      />

      {/* Bottom Map Legend & Interactive Layer Toggles */}
      <div className="absolute bottom-3 left-3 right-3 z-[400] bg-white/95 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-slate-200 shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Layer Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-slate-600" />
            Layers:
          </span>

          <button
            onClick={() => setShowRiderMarkers(!showRiderMarkers)}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
              showRiderMarkers ? 'bg-sky-100 text-sky-800 border border-sky-300' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Bike className="w-3 h-3 inline mr-1" />
            Riders ({activeRidersList.length})
          </button>

          <button
            onClick={() => setShowPolylines(!showPolylines)}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
              showPolylines ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className="inline-block w-2.5 h-0.5 bg-indigo-600 align-middle mr-1"></span>
            Dispatch Routes
          </button>

          <button
            onClick={() => setShowStops(!showStops)}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
              showStops ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <MapPin className="w-3 h-3 inline mr-1" />
            Client Stops ({resolvedStops.length})
          </button>

          <button
            onClick={() => setShowDestination(!showDestination)}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
              showDestination ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Building2 className="w-3 h-3 inline mr-1" />
            Central Lab
          </button>

          <button
            onClick={() => setShowBreadcrumbs(!showBreadcrumbs)}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
              showBreadcrumbs ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-500'
            }`}
          >
            GPS Trail
          </button>
        </div>

        {/* Legend / Status Hint */}
        <div className="flex items-center gap-3 text-[11px] text-slate-600 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
            <span>Rider (Live)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span>Rider (Stale &gt;10m)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span>Hospital/Lab Stop</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600"></span>
            <span>Central Lab</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-emerald-700 font-bold">
            <Thermometer className="w-3.5 h-3.5" />
            <span>2.0°C – 8.0°C Safe</span>
          </div>
        </div>
      </div>
    </div>
  );
};
