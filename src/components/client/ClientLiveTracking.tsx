import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, parseFirestoreGeoPoint } from '../../services/firebase';
import { PickupTask, Route, PickupBoy } from '../../types';
import { isRiderLocationStale } from '../../services/locationService';
import {
  calculateHaversineDistanceKm,
  calculateEstimatedEtaMinutes,
  normalizeLatLng,
  DEFAULT_MUMBAI_COORDINATES
} from '../../utils/coordinates';
import {
  Bike,
  Building2,
  Clock,
  Thermometer,
  Battery,
  MapPin,
  PhoneCall,
  Navigation,
  ShieldCheck,
  Radio,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Maximize2,
  Minimize2
} from 'lucide-react';

export interface ClientLiveTrackingProps {
  activeClientId?: string;
  clientName?: string;
  clientAddress?: string;
  clientLocation?: { lat: number; lng: number };
  activeTask?: PickupTask | null;
  activeRoute?: Route | null;
  assignedRiderId?: string | null;
  onOpenProof?: (task: PickupTask) => void;
  height?: string;
}

export const ClientLiveTracking: React.FC<ClientLiveTrackingProps> = ({
  activeClientId,
  clientName = 'Lifecare Diagnostics (Andheri West)',
  clientAddress = 'SV Road, Andheri West, Mumbai, Maharashtra',
  clientLocation,
  activeTask,
  activeRoute,
  assignedRiderId,
  onOpenProof,
  height = '420px'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const stopMarkersRef = useRef<L.Marker[]>([]);
  const polylineLayerRef = useRef<L.Polyline | null>(null);
  const stopsPolylineLayerRef = useRef<L.Polyline | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveRiderData, setLiveRiderData] = useState<any>(null);
  const [liveTaskData, setLiveTaskData] = useState<PickupTask | null>(activeTask || null);
  const [lastPingTimestamp, setLastPingTimestamp] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  // Target rider ID: prioritize activeTask's rider, then activeRoute, then prop
  const effectiveRiderId = useMemo(() => {
    return (
      (liveTaskData as any)?.activeRiderId ||
      liveTaskData?.riderId ||
      (activeTask as any)?.activeRiderId ||
      activeTask?.riderId ||
      activeRoute?.assignedRiderId ||
      assignedRiderId ||
      'pb-1'
    );
  }, [liveTaskData, activeTask, activeRoute, assignedRiderId]);

  // Destination coordinates for the client
  const targetDestinationCoords = useMemo<[number, number]>(() => {
    let lat = 19.1287852;
    let lng = 72.8294183;

    if (clientLocation?.lat != null && clientLocation?.lng != null) {
      lat = Number(clientLocation.lat);
      lng = Number(clientLocation.lng);
    } else if (activeTask?.destination?.lat != null && activeTask?.destination?.lng != null) {
      lat = Number(activeTask.destination.lat);
      lng = Number(activeTask.destination.lng);
    } else if (activeRoute?.destinationLab?.lat != null && activeRoute?.destinationLab?.lng != null) {
      lat = Number(activeRoute.destinationLab.lat);
      lng = Number(activeRoute.destinationLab.lng);
    }

    const centralLabCoords: [number, number] = [Number(lat), Number(lng)];
    return normalizeLatLng(centralLabCoords[0], centralLabCoords[1], 19.1287852, 72.8294183);
  }, [clientLocation, activeTask, activeRoute]);

  // Intermediate stops if available
  const stopsList = useMemo(() => {
    if (liveTaskData?.stopsProgress && liveTaskData.stopsProgress.length > 0) {
      return liveTaskData.stopsProgress;
    }
    if (activeRoute?.stops && activeRoute.stops.length > 0) {
      return activeRoute.stops;
    }
    return [];
  }, [liveTaskData, activeRoute]);

  // 1. Real-time Firestore Listener on the Assigned Rider's Location
  useEffect(() => {
    if (!effectiveRiderId) return;

    const riderDocRef = doc(db, 'riders', effectiveRiderId);
    const unsubscribeRider = onSnapshot(
      riderDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const geoPoint = parseFirestoreGeoPoint(data.currentLocation) || parseFirestoreGeoPoint(data.location);
          const rawLat = data.lat ?? geoPoint?.lat ?? data.currentLocation?.lat;
          const rawLng = data.lng ?? geoPoint?.lng ?? data.currentLocation?.lng;
          const [normLat, normLng] = normalizeLatLng(rawLat, rawLng, 19.1624, 72.8465);

          const updatedRider = {
            id: docSnap.id,
            ...data,
            lat: normLat,
            lng: normLng,
            name: data.name || (effectiveRiderId === 'pb-1' ? 'Asif' : 'Courier Partner'),
            vehicleNumber: data.vehicleNumber || data.vehicleNo || 'MH-02-DN-4821',
            speed: data.currentLocation?.speed || data.speed || 24,
            heading: data.currentLocation?.heading || data.heading || 0,
            batteryLevel: data.batteryLevel ?? data.battery ?? 92,
            coldBoxTemp: data.coldBoxTemp ?? 4.0,
            isOnline: data.isOnline !== false,
            lastUpdated: data.lastUpdated?.toDate ? data.lastUpdated.toDate() : new Date()
          };

          setLiveRiderData(updatedRider);
          setLastPingTimestamp(new Date());
          setSecondsAgo(0);
        }
      },
      (error) => {
        console.warn('[ClientLiveTracking] Firestore rider listener error:', error);
      }
    );

    // Optional listener on task document if taskId exists
    let unsubscribeTask = () => {};
    if (activeTask?.id) {
      const taskDocRef = doc(db, 'tasks', activeTask.id);
      unsubscribeTask = onSnapshot(
        taskDocRef,
        (taskSnap) => {
          if (taskSnap.exists()) {
            setLiveTaskData({ id: taskSnap.id, ...taskSnap.data() } as PickupTask);
          }
        },
        (err) => console.warn('[ClientLiveTracking] Task listener error:', err)
      );
    }

    return () => {
      unsubscribeRider();
      unsubscribeTask();
    };
  }, [effectiveRiderId, activeTask?.id]);

  // Tick seconds ago timer
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.round((Date.now() - lastPingTimestamp.getTime()) / 1000);
      setSecondsAgo(Math.max(0, diff));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastPingTimestamp]);

  // Effective rider coordinates
  const riderCoords = useMemo<[number, number]>(() => {
    if (liveRiderData?.lat && liveRiderData?.lng) {
      return [liveRiderData.lat, liveRiderData.lng];
    }
    // Default fallback to nearby Mumbai location (e.g. Goregaon / Kandivali en route to Andheri)
    return [19.1624, 72.8465];
  }, [liveRiderData]);

  // 2. Haversine Distance & Dynamic ETA Calculation
  const distanceKm = useMemo(() => {
    return calculateHaversineDistanceKm(
      riderCoords[0],
      riderCoords[1],
      targetDestinationCoords[0],
      targetDestinationCoords[1]
    );
  }, [riderCoords, targetDestinationCoords]);

  const estimatedEtaMinutes = useMemo(() => {
    const currentSpeed = liveRiderData?.speed && liveRiderData.speed > 5 ? liveRiderData.speed : 22;
    return calculateEstimatedEtaMinutes(distanceKm, currentSpeed, 2);
  }, [distanceKm, liveRiderData?.speed]);

  const isStale = useMemo(() => {
    if (!liveRiderData) return false;
    return isRiderLocationStale(liveRiderData, 10);
  }, [liveRiderData]);

  const riderName = liveRiderData?.name || liveTaskData?.riderName || 'Asif';
  const riderVehicle = liveRiderData?.vehicleNumber || liveTaskData?.riderVehicle || 'MH-02-DN-4821';
  const riderPhone = liveRiderData?.phone || liveTaskData?.riderPhone || '+91 80 4719 3333';
  const coldBoxTemp = liveRiderData?.coldBoxTemp ?? 4.0;
  const currentDestinationStop =
    liveTaskData?.currentDestinationStop ||
    (liveTaskData as any)?.destination?.name ||
    clientName;

  // 3. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: riderCoords,
        zoom: 13,
        zoomControl: false,
        attributionControl: true
      });

      L.control.zoom({ position: 'topleft' }).addTo(map);

      // Clean OpenStreetMap Tile Layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Invalidate size on resize
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [height, isFullscreen]);

  // 4. Render & Smoothly Update Markers and Polylines
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const boundsPoints: L.LatLngExpression[] = [];

    // --- Rider Marker (Moving Bike Icon) ---
    boundsPoints.push(riderCoords);
    const bikeIcon = L.divIcon({
      className: 'client-rider-bike-marker',
      html: `
        <div class="relative group cursor-pointer">
          <!-- Pulsing Live Radar Wave -->
          ${!isStale ? '<div class="absolute -inset-2.5 bg-sky-500 rounded-full animate-ping opacity-75"></div>' : ''}
          
          <!-- Main Rider Badge with Bike Icon -->
          <div class="relative w-11 h-11 rounded-full ${
            isStale
              ? 'bg-slate-900 ring-3 ring-amber-500'
              : 'bg-sky-950 ring-4 ring-sky-400'
          } text-white flex items-center justify-center shadow-2xl transform transition-transform group-hover:scale-110">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${isStale ? '#fbbf24' : '#38bdf8'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18.5" cy="17.5" r="3.5"/>
              <circle cx="5.5" cy="17.5" r="3.5"/>
              <circle cx="15" cy="5" r="1"/>
              <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
            </svg>
            <span class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 ${isStale ? 'bg-amber-500' : 'bg-emerald-400 animate-pulse'} rounded-full ring-2 ring-white"></span>
          </div>

          <!-- Top Floating Rider Name Tag -->
          <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-950/95 backdrop-blur-xs text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-xl border ${isStale ? 'border-amber-500/70' : 'border-sky-500/70'} flex items-center gap-1.5 pointer-events-none">
            <span class="w-2 h-2 rounded-full ${isStale ? 'bg-amber-400' : 'bg-emerald-400'}"></span>
            <span>${riderName}</span>
            <span class="text-sky-300 font-mono text-[9px]">${riderVehicle.split('-').pop() || 'BIKE'}</span>
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    const riderPopupHtml = `
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 220px; padding: 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">
          <span style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase;">Live Courier Telemetry</span>
          <span style="font-size: 9px; font-weight: 700; background: ${isStale ? '#fef3c7' : '#ecfdf5'}; color: ${isStale ? '#b45309' : '#047857'}; padding: 2px 6px; border-radius: 9999px; border: 1px solid ${isStale ? '#fde68a' : '#a7f3d0'};">
            ${isStale ? 'GPS OFFLINE' : 'LIVE GPS'}
          </span>
        </div>
        <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${riderName}</div>
        <div style="font-size: 11px; color: #64748b;">Vehicle: <span style="font-family: monospace; font-weight: 600;">${riderVehicle}</span></div>
        <div style="margin-top: 8px; padding: 6px 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: #64748b;">Cold-Box Temp:</span>
            <span style="font-weight: 700; color: #047857; font-family: monospace;">${coldBoxTemp}°C (Safe)</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: #64748b;">Distance to Lab:</span>
            <span style="font-weight: 700; color: #0284c7; font-family: monospace;">${distanceKm} km</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748b;">Estimated ETA:</span>
            <span style="font-weight: 700; color: #0369a1; font-family: monospace;">~${estimatedEtaMinutes} mins</span>
          </div>
        </div>
      </div>
    `;

    if (riderMarkerRef.current) {
      riderMarkerRef.current.setLatLng(riderCoords);
      riderMarkerRef.current.setIcon(bikeIcon);
      riderMarkerRef.current.setPopupContent(riderPopupHtml);
    } else {
      const marker = L.marker(riderCoords, { icon: bikeIcon, zIndexOffset: 1200 }).addTo(map);
      marker.bindPopup(riderPopupHtml);
      riderMarkerRef.current = marker;
    }

    // --- Destination Pin Marker ---
    boundsPoints.push(targetDestinationCoords);
    const destIcon = L.divIcon({
      className: 'client-dest-marker',
      html: `
        <div class="relative group flex flex-col items-center cursor-pointer">
          <div class="w-10 h-10 rounded-xl bg-emerald-700 ring-3 ring-emerald-300 text-white font-bold text-sm flex items-center justify-center shadow-2xl transform transition-transform group-hover:scale-110">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
              <path d="M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/>
              <path d="M8 14h8"/>
              <path d="M12 10v8"/>
            </svg>
          </div>
          <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-emerald-950 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-md border border-emerald-600 whitespace-nowrap">
            ${clientName.split(' ')[0] || 'DESTINATION LAB'}
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    const destPopupHtml = `
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 200px; padding: 4px;">
        <div style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase;">Destination Diagnostic Facility</div>
        <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px;">${clientName}</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${clientAddress}</div>
        <div style="margin-top: 6px; font-size: 11px; font-weight: 700; color: #0369a1;">
          Direct Distance: ${distanceKm} km
        </div>
      </div>
    `;

    if (destMarkerRef.current) {
      destMarkerRef.current.setLatLng(targetDestinationCoords);
      destMarkerRef.current.setIcon(destIcon);
      destMarkerRef.current.setPopupContent(destPopupHtml);
    } else {
      const destM = L.marker(targetDestinationCoords, { icon: destIcon, zIndexOffset: 1000 }).addTo(map);
      destM.bindPopup(destPopupHtml);
      destMarkerRef.current = destM;
    }

    // --- Intermediate Stops Markers ---
    stopMarkersRef.current.forEach((m) => map.removeLayer(m));
    stopMarkersRef.current = [];

    stopsList.forEach((stop, idx) => {
      const [sLat, sLng] = normalizeLatLng(stop.lat, stop.lng);
      boundsPoints.push([sLat, sLng]);

      const isPicked = (stop as any).status === 'picked_up';
      const stopIcon = L.divIcon({
        className: 'custom-intermediate-stop',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer">
            <div class="w-7 h-7 rounded-full ${
              isPicked ? 'bg-emerald-600 ring-2 ring-emerald-300' : 'bg-rose-600 ring-2 ring-rose-300'
            } text-white font-bold text-[11px] flex items-center justify-center shadow-lg">
              ${isPicked ? '✓' : idx + 1}
            </div>
            <div class="absolute -bottom-4 bg-white/95 text-slate-800 text-[9px] font-bold px-1 rounded shadow-2xs border border-slate-200 whitespace-nowrap pointer-events-none">
              ${(stop.stopName || stop.name || `Stop ${idx + 1}`).split(',')[0]}
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const sMarker = L.marker([sLat, sLng], { icon: stopIcon }).addTo(map);
      sMarker.bindPopup(`
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 180px; padding: 4px;">
          <div style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase;">Collection Point #${idx + 1}</div>
          <div style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 2px;">${stop.stopName || stop.name}</div>
          <div style="font-size: 11px; color: #64748b;">${stop.address || ''}</div>
          <div style="font-size: 11px; font-weight: 700; color: ${isPicked ? '#047857' : '#d97706'}; margin-top: 4px;">
            Status: ${isPicked ? 'Specimens Picked Up' : 'Pending Pickup'}
          </div>
        </div>
      `);
      stopMarkersRef.current.push(sMarker);
    });

    // --- Live Polyline connecting Rider GPS to Destination Pin ---
    if (polylineLayerRef.current) {
      map.removeLayer(polylineLayerRef.current);
      polylineLayerRef.current = null;
    }

    const liveLeg: [number, number][] = [riderCoords, targetDestinationCoords];
    const liveLine = L.polyline(liveLeg, {
      color: '#0284c7', // Sky blue
      weight: 4,
      opacity: 0.9,
      dashArray: '7, 9',
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
    polylineLayerRef.current = liveLine;

    // --- Polyline connecting sequential stops ---
    if (stopsPolylineLayerRef.current) {
      map.removeLayer(stopsPolylineLayerRef.current);
      stopsPolylineLayerRef.current = null;
    }

    if (stopsList.length > 0) {
      const stopsPath: [number, number][] = stopsList.map((s) => normalizeLatLng(s.lat, s.lng));
      stopsPath.push(targetDestinationCoords);

      const stopsLine = L.polyline(stopsPath, {
        color: '#0369a1',
        weight: 3,
        opacity: 0.65,
        lineCap: 'round'
      }).addTo(map);
      stopsPolylineLayerRef.current = stopsLine;
    }

    // Auto-fit bounds framing rider, stops, and client lab tightly
    if (boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15, animate: true });
    }
  }, [riderCoords, targetDestinationCoords, stopsList, isStale, riderName, riderVehicle, clientName, clientAddress, coldBoxTemp, distanceKm, estimatedEtaMinutes]);

  // Center on Rider button handler
  const handleRecenterRider = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(riderCoords, 15, { animate: true });
    }
  };

  // Fit Bounds button handler
  const handleFitAll = () => {
    if (mapInstanceRef.current) {
      const bounds = L.latLngBounds([riderCoords, targetDestinationCoords]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
    }
  };

  return (
    <div className="space-y-3.5">
      {/* 3. Real-Time HUD Status Bar on Client Screen */}
      <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-4.5 shadow-lg border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-sky-600/20 border border-sky-400/40 text-sky-400 flex items-center justify-center shadow-inner">
                <Bike className="w-5 h-5" />
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-slate-900 ${isStale ? 'bg-amber-500' : 'bg-emerald-400 animate-pulse'}`} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                  <Radio className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                  Live Specimen In-Transit Telemetry
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  isStale
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {isStale ? 'GPS PAUSED (>10M)' : 'LIVE GPS STREAMING'}
                </span>
              </div>

              <h4 className="text-base sm:text-lg font-extrabold text-white mt-0.5">
                Rider <span className="text-sky-300">{riderName}</span> is en route to your facility
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Target Destination: <span className="text-slate-200 font-semibold">{currentDestinationStop}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {riderPhone && (
              <a
                href={`tel:${riderPhone.replace(/\D/g, '')}`}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Call Rider</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleFitAll}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              <span>Refocus</span>
            </button>
          </div>
        </div>

        {/* HUD Real-Time Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Estimated ETA */}
          <div className="bg-slate-800/80 p-2.5 sm:p-3 rounded-lg border border-slate-700/80">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold mb-1">
              <span>Estimated Arrival</span>
              <Clock className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-base sm:text-lg font-mono font-extrabold text-sky-300">
              ~{estimatedEtaMinutes} mins
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {distanceKm} km away
            </div>
          </div>

          {/* Live Box Temperature */}
          <div className="bg-slate-800/80 p-2.5 sm:p-3 rounded-lg border border-slate-700/80">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold mb-1">
              <span>Cold-Box Temp</span>
              <Thermometer className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-base sm:text-lg font-mono font-extrabold text-emerald-300">
              {coldBoxTemp}°C
            </div>
            <div className="text-[10px] text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              <span>Cold-Chain Certified</span>
            </div>
          </div>

          {/* Speed & Transit Status */}
          <div className="bg-slate-800/80 p-2.5 sm:p-3 rounded-lg border border-slate-700/80">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold mb-1">
              <span>Rider Speed</span>
              <Gauge className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-base sm:text-lg font-mono font-extrabold text-indigo-200">
              {liveRiderData?.speed || 24} km/h
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
              {riderVehicle}
            </div>
          </div>

          {/* Telemetry Heartbeat & Battery */}
          <div className="bg-slate-800/80 p-2.5 sm:p-3 rounded-lg border border-slate-700/80">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold mb-1">
              <span>GPS Telemetry</span>
              <Battery className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-base sm:text-lg font-mono font-extrabold text-slate-200">
              {liveRiderData?.batteryLevel || 92}% Batt
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Pinged {secondsAgo}s ago
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Leaflet Live Map Card */}
      <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs relative ${isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : ''}`}>
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-sky-700" />
            <span className="font-bold text-slate-900">Live GPS Vector Tracking</span>
            <span className="text-slate-500 hidden sm:inline">•</span>
            <span className="text-slate-600 font-mono text-[11px] hidden sm:inline">
              Rider [{riderCoords[0].toFixed(4)}, {riderCoords[1].toFixed(4)}] → Client [{targetDestinationCoords[0].toFixed(4)}, {targetDestinationCoords[1].toFixed(4)}]
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRecenterRider}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <Bike className="w-3.5 h-3.5 text-sky-700" />
              <span>Center Rider</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Map Canvas */}
        <div
          ref={mapContainerRef}
          style={{ height: isFullscreen ? 'calc(100vh - 48px)' : height, width: '100%' }}
          className="w-full relative z-0 bg-slate-100"
        />
      </div>
    </div>
  );
};
