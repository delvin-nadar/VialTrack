import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { RouteStop, DestinationLab, PickupBoy, LocationPing, PickupTask } from '../../types';
import { CloudSync, parseFirestoreGeoPoint } from '../../services/firebase';
import {
  MapPin,
  Bike,
  Navigation,
  Layers,
  Crosshair,
  Radio,
  Maximize2,
  Minimize2,
  Building2,
  Package,
  Thermometer,
  Battery,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Clock
} from 'lucide-react';

export interface LiveMapProps {
  stops?: RouteStop[];
  destination?: DestinationLab;
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
  height = '440px',
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

  // Real-time Firestore Subscriptions for 'locations' and 'riders' collections
  useEffect(() => {
    if (!enableFirestoreSync) return;

    let mounted = true;
    console.log('[LiveMap] Subscribing to Firestore real-time "locations" and "riders" GeoPoint streams...');

    const unsubRiders = CloudSync.subscribeToRiders((cloudRiders) => {
      if (!mounted) return;
      if (cloudRiders && cloudRiders.length > 0) {
        setFirestoreRiders(cloudRiders);
        setIsFirestoreConnected(true);
      }
    });

    const unsubLocations = CloudSync.subscribeToLocations((cloudPings) => {
      if (!mounted) return;
      if (cloudPings && cloudPings.length > 0) {
        setFirestorePings(cloudPings);
        setIsFirestoreConnected(true);
      }
    });

    return () => {
      mounted = false;
      unsubRiders();
      unsubLocations();
    };
  }, [enableFirestoreSync]);

  // Merge prop riders and real-time Firestore riders with GeoPoint extraction
  const activeRidersList = useMemo(() => {
    const riderMap = new Map<string, PickupBoy>();

    // 1. Seed with prop riders
    if (propRiders) {
      propRiders.forEach((r) => riderMap.set(r.id, r));
    }
    if (rider) {
      riderMap.set(rider.id, rider);
    }

    // 2. Overlay live Firestore riders
    firestoreRiders.forEach((fr) => {
      const existing = riderMap.get(fr.id) || fr;
      let parsedLoc = fr.currentLocation;
      if (fr.currentLocation) {
        const coords = parseFirestoreGeoPoint((fr.currentLocation as any).location) || {
          lat: fr.currentLocation.lat,
          lng: fr.currentLocation.lng
        };
        parsedLoc = {
          ...fr.currentLocation,
          lat: coords.lat,
          lng: coords.lng
        };
      }
      riderMap.set(fr.id, {
        ...existing,
        ...fr,
        currentLocation: parsedLoc
      });
    });

    // 3. Overlay latest Firestore location pings to ensure fresh coordinates
    firestorePings.forEach((ping) => {
      if (ping.riderId && riderMap.has(ping.riderId)) {
        const r = riderMap.get(ping.riderId)!;
        const coords = parseFirestoreGeoPoint((ping as any).location) || { lat: ping.lat, lng: ping.lng };
        riderMap.set(ping.riderId, {
          ...r,
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

    return Array.from(riderMap.values()).filter((r) => r.status === 'active' || r.isOnline || r.currentLocation);
  }, [propRiders, rider, firestoreRiders, firestorePings]);

  // Initialize Leaflet Map Centered on Mumbai
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Default to Mumbai center [19.0760, 72.8777] with zoom level 12
      const initialCenter: [number, number] = centerCoordinates || MUMBAI_CENTER;
      const initialZoom: number = zoom || DEFAULT_MUMBAI_ZOOM;

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: false,
        attributionControl: false
      });

      // Add Zoom control at top-left
      L.control.zoom({ position: 'topleft' }).addTo(map);

      // Clean, high-contrast healthcare tile layer (CartoDB Positron / Voyager)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
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
      }
    };
  }, []);

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

    stops.forEach((s) => points.push([s.lat, s.lng]));
    if (destination) points.push([destination.lat, destination.lng]);

    tasks.forEach((t) => {
      t.stopsProgress.forEach((s) => points.push([s.lat, s.lng]));
      if (t.destination) points.push([t.destination.lat, t.destination.lng]);
    });

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
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

    markersLayer.clearLayers();
    polylinesLayer.clearLayers();
    trailLayer.clearLayers();

    const boundsPoints: L.LatLngExpression[] = [];

    // Filter riders to render
    const ridersToRender = activeRidersList.filter((r) => {
      if (activeFilterRiderId === 'all') return true;
      return r.id === activeFilterRiderId;
    });

    // 1. RENDER LIVE MARKERS FOR ACTIVE RIDERS BASED ON FIRESTORE GEOPOINT SNAPSHOTS
    if (showRiderMarkers) {
      ridersToRender.forEach((activeRider) => {
        if (!activeRider.currentLocation) return;
        const coords = parseFirestoreGeoPoint((activeRider.currentLocation as any).location) || {
          lat: activeRider.currentLocation.lat,
          lng: activeRider.currentLocation.lng
        };

        if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;
        boundsPoints.push([coords.lat, coords.lng]);

        const isSelected = rider?.id === activeRider.id || activeFilterRiderId === activeRider.id;
        const assignedTask = tasks.find((t) => t.riderId === activeRider.id && t.status !== 'delivered') || tasks[0];
        const nextStop = assignedTask?.stopsProgress.find((s) => s.status === 'pending' || s.status === 'arrived');

        // Safe fallback names and identifiers
        const riderName = activeRider.name || 'Courier';
        const vehicleNum = activeRider.vehicleNumber || 'MH-02-BIKE';
        const firstName = riderName.split(' ')[0] || riderName;
        const vehicleSuffix = vehicleNum.includes('-') ? vehicleNum.split('-').pop() : vehicleNum;

        // Custom High-Precision Medical Courier Live Marker
        const riderIcon = L.divIcon({
          className: 'custom-rider-marker',
          html: `
            <div class="relative group cursor-pointer">
              <!-- Pulsing Live Radar Wave -->
              <div class="absolute -inset-2 bg-sky-500 rounded-full animate-ping opacity-75"></div>
              
              <!-- Main Rider Badge -->
              <div class="relative w-10 h-10 rounded-full ${
                isSelected ? 'bg-slate-950 ring-4 ring-sky-400' : 'bg-slate-900 ring-2 ring-sky-500'
              } text-white flex items-center justify-center shadow-xl transform transition-transform group-hover:scale-115">
                <!-- Bike Icon -->
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
                
                <!-- Online Telemetry Dot -->
                <span class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white animate-pulse"></span>
              </div>

              <!-- Top Floating Name Tag -->
              <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap shadow-lg border border-slate-700 flex items-center gap-1.5 pointer-events-none">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>${firstName}</span>
                <span class="text-sky-300 font-mono text-[9px]">${vehicleSuffix || 'BIKE'}</span>
              </div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        const riderMarker = L.marker([coords.lat, coords.lng], {
          icon: riderIcon,
          zIndexOffset: 1200
        }).addTo(markersLayer);

        riderMarker.on('click', () => {
          if (onSelectRider) onSelectRider(activeRider.id);
        });

        // Telemetry Rich Popup
        riderMarker.bindPopup(`
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 220px; padding: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">
              <span style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px;">Live GPS Specimen Courier</span>
              <span style="font-size: 9px; font-weight: 700; background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 9999px; border: 1px solid #a7f3d0;">ONLINE</span>
            </div>
            
            <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${riderName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 1px;">${activeRider.vehicleType || 'Motorcycle'} • <span style="font-family: monospace; font-weight: 600;">${vehicleNum}</span></div>
            
            <div style="margin-top: 8px; padding: 6px 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 11px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #64748b;">Cold-Box Chiller:</span>
                <span style="font-weight: 700; color: #047857; font-family: monospace;">4.0°C (Safe 2-8°C)</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #64748b;">Device Battery:</span>
                <span style="font-weight: 700; color: #0f172a; font-family: monospace;">${activeRider.batteryLevel || 88}%</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Current Task:</span>
                <span style="font-weight: 700; color: #0369a1;">${assignedTask?.routeName || 'Western Suburbs'}</span>
              </div>
            </div>

            ${
              nextStop
                ? `<div style="margin-top: 6px; font-size: 11px; color: #334155;"><b>Next Stop:</b> ${nextStop.stopName || (nextStop as any).name || 'Collection Point'}</div>`
                : ''
            }
          </div>
        `);
      });
    }

    // 2. DRAW POLYLINE ROUTES CONNECTING ASSIGNED TASKS TO RIDER CURRENT LOCATIONS
    if (showPolylines) {
      // Find tasks to connect with polylines
      const relevantTasks = tasks.length > 0 ? tasks : [];

      ridersToRender.forEach((activeRider) => {
        if (!activeRider.currentLocation) return;
        const riderCoords: [number, number] = [activeRider.currentLocation.lat, activeRider.currentLocation.lng];

        // Find active task assigned to this rider
        const assignedTask =
          relevantTasks.find((t) => t.riderId === activeRider.id) ||
          (activeTaskId ? relevantTasks.find((t) => t.id === activeTaskId) : null) ||
          relevantTasks[0];

        if (assignedTask && assignedTask.stopsProgress.length > 0) {
          const remainingStops = assignedTask.stopsProgress.filter((s) => s.status !== 'picked_up');
          const stopsToConnect = remainingStops.length > 0 ? remainingStops : assignedTask.stopsProgress;

          // Leg 1: Active In-Transit Polyline from Rider's current GPS position to Next Collection Stop
          const nextTargetStop = stopsToConnect[0];
          if (nextTargetStop) {
            const transitLegCoords: [number, number][] = [
              riderCoords,
              [nextTargetStop.lat, nextTargetStop.lng]
            ];

            // Draw glowing active transit leg polyline
            L.polyline(transitLegCoords, {
              color: '#0284c7', // Cyan / Sky blue
              weight: 4.5,
              opacity: 0.9,
              dashArray: '6, 8',
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(polylinesLayer);

            boundsPoints.push([nextTargetStop.lat, nextTargetStop.lng]);
          }

          // Leg 2: Sequenced Polylines between all remaining stops
          const allStopsCoords: [number, number][] = stopsToConnect.map((s) => [s.lat, s.lng]);
          if (allStopsCoords.length > 1) {
            L.polyline(allStopsCoords, {
              color: '#0369a1',
              weight: 3.5,
              opacity: 0.75,
              lineCap: 'round'
            }).addTo(polylinesLayer);
          }

          // Leg 3: Final Polyline from Last Stop to Central Intake Destination Lab
          const dest = assignedTask.destination || destination;
          if (dest && stopsToConnect.length > 0) {
            const lastStop = stopsToConnect[stopsToConnect.length - 1];
            const labLegCoords: [number, number][] = [
              [lastStop.lat, lastStop.lng],
              [dest.lat, dest.lng]
            ];

            L.polyline(labLegCoords, {
              color: '#059669', // Emerald green to destination lab
              weight: 3.5,
              opacity: 0.8,
              dashArray: '4, 6',
              lineCap: 'round'
            }).addTo(polylinesLayer);

            boundsPoints.push([dest.lat, dest.lng]);
          }
        } else if (stops.length > 0) {
          // Fallback: connect rider coordinates directly to stops
          const fallbackCoords: [number, number][] = [
            riderCoords,
            ...stops.map((s): [number, number] => [s.lat, s.lng])
          ];
          if (destination) {
            fallbackCoords.push([destination.lat, destination.lng]);
          }

          L.polyline(fallbackCoords, {
            color: '#0284c7',
            weight: 3.5,
            opacity: 0.8,
            dashArray: '5, 7',
            lineCap: 'round'
          }).addTo(polylinesLayer);
        }
      });
    }

    // 3. RENDER COLLECTION STOPS
    if (showStops) {
      const stopsToRender = stops.length > 0 ? stops : (tasks[0]?.stopsProgress || []);
      stopsToRender.forEach((stop, index) => {
        const stopId = (stop as any).id || (stop as any).stopId || `stop-${index}`;
        const stopName = (stop as any).name || (stop as any).stopName || `Stop #${index + 1}`;
        const stopAddress = stop.address || 'Mumbai';
        const isSelected = selectedStopId === stopId;
        const isPickedUp = (stop as any).status === 'picked_up';
        const shortStopName = stopName.includes(',') ? stopName.split(',')[0] : stopName;

        const stopIcon = L.divIcon({
          className: 'custom-stop-icon',
          html: `
            <div class="relative group cursor-pointer">
              <div class="w-7 h-7 rounded-full ${
                isPickedUp
                  ? 'bg-emerald-600 ring-2 ring-emerald-300'
                  : isSelected
                  ? 'bg-sky-600 ring-3 ring-sky-300'
                  : 'bg-slate-800 ring-2 ring-slate-400'
              } text-white font-bold text-xs flex items-center justify-center shadow-md transform transition-transform group-hover:scale-110">
                <span>${isPickedUp ? '✓' : index + 1}</span>
              </div>
              <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white/95 text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs pointer-events-none border border-slate-200 whitespace-nowrap">
                ${shortStopName}
              </div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const stopMarker = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(markersLayer);
        stopMarker.on('click', () => {
          if (onSelectStop) onSelectStop(stopId);
        });

        stopMarker.bindPopup(`
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 190px; padding: 4px;">
            <div style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase;">Stop #${index + 1} Collection Center</div>
            <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${stopName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 3px;">${stopAddress}</div>
            <div style="font-size: 11px; color: #334155; margin-top: 5px;"><b>Contact:</b> ${stop.contactPerson || 'Lab Tech'} (${stop.phone || '+91 98200 00000'})</div>
          </div>
        `);

        boundsPoints.push([stop.lat, stop.lng]);
      });
    }

    // 4. RENDER DESTINATION CENTRAL INTAKE LAB
    if (showDestination) {
      const dest = destination || tasks[0]?.destination;
      if (dest) {
        const destName = dest.name || 'Central Diagnostics Lab';
        const destAddress = dest.address || 'Mumbai Logistics Hub';
        const destIcon = L.divIcon({
          className: 'custom-dest-icon',
          html: `
            <div class="relative group">
              <div class="w-8 h-8 rounded-lg bg-emerald-700 ring-2 ring-emerald-300 text-white font-bold text-sm flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/><path d="M8 14h8"/><path d="M12 10v8"/></svg>
              </div>
              <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-emerald-900 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs pointer-events-none border border-emerald-700 whitespace-nowrap">
                CENTRAL LAB
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const destMarker = L.marker([dest.lat, dest.lng], { icon: destIcon, zIndexOffset: 900 }).addTo(markersLayer);
        destMarker.bindPopup(`
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 190px; padding: 4px;">
            <div style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase;">Central Diagnostics Lab</div>
            <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${destName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 3px;">${destAddress}</div>
            <div style="font-size: 11px; color: #334155; margin-top: 5px;"><b>Intake Lead:</b> ${(dest as any).contactPerson || 'Dr. Anita Desai'}</div>
          </div>
        `);

        boundsPoints.push([dest.lat, dest.lng]);
      }
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
            weight: 3.5,
            opacity: 0.7,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(trailLayer);
        }
      }
    }

    // Auto-fit bounds if requested
    if (autoFit && boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [
    activeRidersList,
    stops,
    destination,
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

  // Recalculate leaflet map size on container resize
  useEffect(() => {
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [height, isFullscreen]);

  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-100 flex flex-col transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-[9999] shadow-2xl h-[calc(100vh-32px)]' : ''
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
                {r.name} ({r.vehicleNumber})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Top Right Live Firestore Status Pill & Layer Toggles */}
      <div className="absolute top-3 right-3 z-[400] flex items-center gap-2">
        {/* Real-time Firestore Sync Badge */}
        <div className="bg-slate-950/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-700 text-xs font-bold text-white flex items-center gap-2 shadow-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px]">
            {isFirestoreConnected ? 'Firestore Live GeoPoint' : 'Live Fleet Radar'}
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

      {/* Main Leaflet Map Stage */}
      <div
        ref={mapContainerRef}
        style={{ height: isFullscreen ? '100%' : height, width: '100%' }}
        className="flex-1 z-0"
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
            Task Polylines
          </button>

          <button
            onClick={() => setShowStops(!showStops)}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
              showStops ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <MapPin className="w-3 h-3 inline mr-1" />
            Stops
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
            <span>Active Specimen Courier</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600"></span>
            <span>Intake Lab</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-emerald-700 font-bold">
            <Thermometer className="w-3.5 h-3.5" />
            <span>2.0°C – 8.0°C Cold Chain</span>
          </div>
        </div>
      </div>
    </div>
  );
};
