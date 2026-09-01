import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { RouteStop, PickupBoy, PickupTask } from '../../types';
import { Navigation, Clock, ShieldCheck, Radio, Compass, LocateFixed } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet asset paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface LiveMapProps {
  stops: RouteStop[];
  destination?: { lat: number; lng: number; name?: string; address?: string };
  rider?: PickupBoy;
  riders?: PickupBoy[];
  tasks?: PickupTask[];
  activeTaskId?: string | null;
  height?: string;
  autoFit?: boolean;
  enableFirestoreSync?: boolean;
}

// Marker Icon Generators
const createRiderIcon = (name: string, vehicleNo?: string) => {
  return L.divIcon({
    className: 'custom-rider-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
        <div style="background: #0284c7; color: white; padding: 2px 7px; border-radius: 12px; font-size: 10px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.35); border: 1.5px solid white; display: flex; align-items: center; gap: 4px;">
          <span style="width: 7px; height: 7px; background: #22c55e; border-radius: 50%; display: inline-block; box-shadow: 0 0 6px #22c55e;"></span>
          ${name} ${vehicleNo ? `<span style="opacity: 0.85; font-size: 8.5px;">(${vehicleNo})</span>` : ''}
        </div>
        <div style="position: relative; margin-top: 2px;">
          <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(2, 132, 199, 0.25); top: -5px; left: -5px; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="background: #0284c7; width: 34px; height: 34px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.35); position: relative; z-index: 2;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
            </svg>
          </div>
        </div>
        <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #0284c7;"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
};

const createStopIcon = (index: number, name: string, isCompleted: boolean) => {
  const bg = isCompleted ? '#10b981' : '#0284c7';
  return L.divIcon({
    className: 'custom-stop-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
        <div style="background: white; color: #1e293b; padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: 700; white-space: nowrap; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.15); margin-bottom: 2px;">
          ${name}
        </div>
        <div style="background: ${bg}; width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px; box-shadow: 0 3px 8px rgba(0,0,0,0.25);">
          ${index + 1}
        </div>
        <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid ${bg};"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
};

const createDestinationIcon = (name?: string) => {
  return L.divIcon({
    className: 'custom-dest-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
        <div style="background: #047857; color: white; padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.25);">
          ${name || 'Central Diagnostic Lab'}
        </div>
        <div style="background: #059669; width: 30px; height: 30px; border-radius: 8px; border: 2.5px solid white; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 3px 8px rgba(0,0,0,0.3); margin-top: 2px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid #059669;"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
};

// Map Auto-Fit & Live Re-center Controller
const MapController: React.FC<{
  bounds: L.LatLngBoundsExpression | null;
  enrouteMode: boolean;
  riderPosition: [number, number] | null;
}> = ({ bounds, enrouteMode, riderPosition }) => {
  const map = useMap();
  const initialFitDone = useRef(false);

  useEffect(() => {
    if (enrouteMode && riderPosition) {
      map.flyTo(riderPosition, 14, { animate: true, duration: 1.2 });
    } else if (bounds && !initialFitDone.current) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
      initialFitDone.current = true;
    }
  }, [bounds, enrouteMode, riderPosition, map]);

  return null;
};

export const LiveMap: React.FC<LiveMapProps> = ({
  stops = [],
  destination,
  rider,
  riders = [],
  tasks = [],
  activeTaskId,
  height = '400px'
}) => {
  // Default Enroute Live Mode to true
  const [enrouteLive, setEnrouteLive] = useState<boolean>(true);
  const [roadPolyline, setRoadPolyline] = useState<[number, number][]>([]);
  const [routeStats, setRouteStats] = useState<{ distanceKm: string; durationMin: number; etaTime: string } | null>(null);
  const [isRouting, setIsRouting] = useState<boolean>(false);

  // Active Rider Extraction
  const activeRider = useMemo(() => {
    if (rider && rider.name !== 'Unassigned' && rider.id) return rider;
    if (activeTaskId) {
      const activeTask = tasks.find((t) => t.id === activeTaskId);
      if (activeTask?.riderId && activeTask.riderId !== 'Unassigned') {
        return riders.find((r) => r.id === activeTask.riderId);
      }
    }
    return undefined;
  }, [rider, activeTaskId, tasks, riders]);

  const riderCoords: [number, number] | null = useMemo(() => {
    if (activeRider?.currentLocation?.lat && activeRider?.currentLocation?.lng) {
      return [activeRider.currentLocation.lat, activeRider.currentLocation.lng];
    }
    return null;
  }, [activeRider]);

  // Construct Road Waypoints
  const waypoints = useMemo(() => {
    const pts: [number, number][] = [];
    if (riderCoords) {
      pts.push(riderCoords);
    }
    stops.forEach((s) => {
      if (s.lat && s.lng) pts.push([s.lat, s.lng]);
    });
    if (destination?.lat && destination?.lng) {
      pts.push([destination.lat, destination.lng]);
    }
    return pts;
  }, [riderCoords, stops, destination]);

  // Live Road Snapping via OSRM Routing Engine
  useEffect(() => {
    if (waypoints.length < 2) {
      setRoadPolyline([]);
      setRouteStats(null);
      return;
    }

    let isMounted = true;
    setIsRouting(true);

    const fetchRoadRoute = async () => {
      try {
        const coordString = waypoints.map((pt) => `${pt[1]},${pt[0]}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Routing network error');
        const data = await response.json();

        if (isMounted && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const latLngs: [number, number][] = route.geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]]
          );
          setRoadPolyline(latLngs);

          const distanceKm = (route.distance / 1000).toFixed(1);
          const durationMin = Math.round(route.duration / 60);

          const now = new Date();
          now.setMinutes(now.getMinutes() + durationMin);
          const etaTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

          setRouteStats({ distanceKm, durationMin, etaTime });
        }
      } catch (err) {
        console.warn('[LiveMap] OSRM Road Route lookup fallback:', err);
        if (isMounted) {
          setRoadPolyline(waypoints);
        }
      } finally {
        if (isMounted) setIsRouting(false);
      }
    };

    fetchRoadRoute();

    return () => {
      isMounted = false;
    };
  }, [waypoints]);

  const bounds = useMemo(() => {
    if (waypoints.length === 0) return null;
    return L.latLngBounds(waypoints.map((p) => L.latLng(p[0], p[1])));
  }, [waypoints]);

  const defaultCenter: [number, number] = riderCoords || waypoints[0] || [19.0330, 73.0297];

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 shadow-inner" style={{ height }}>
      {/* Top Enroute Live Navigation HUD Bar */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEnrouteLive((prev) => !prev)}
          className={`px-3 py-1.5 rounded-xl border shadow-md font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md ${
            enrouteLive
              ? 'bg-sky-700 text-white border-sky-800 ring-2 ring-sky-400/40'
              : 'bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Radio className={`w-3.5 h-3.5 ${enrouteLive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
          <span>Enroute Live</span>
          <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${enrouteLive ? 'bg-emerald-500 text-white font-mono' : 'bg-slate-200 text-slate-600'}`}>
            {enrouteLive ? 'DEFAULT ON' : 'PAUSED'}
          </span>
        </button>
      </div>

      {/* Real-Time Road ETA & Telemetry Badge */}
      {routeStats && activeRider && (
        <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1 animate-in fade-in">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-sky-700" />
              <span>Enroute Road Route</span>
            </span>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-200">
              Live ETA
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-0.5 font-mono text-[11px]">
            <div>
              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Remaining</span>
              <span className="font-bold text-slate-800">{routeStats.distanceKm} km</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Est. Duration</span>
              <span className="font-bold text-sky-700">{routeStats.durationMin} mins</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Target Arrival</span>
              <span className="font-bold text-emerald-700">{routeStats.etaTime}</span>
            </div>
          </div>
        </div>
      )}

      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController
          bounds={bounds}
          enrouteMode={enrouteLive}
          riderPosition={riderCoords}
        />

        {/* Road-Snapped Polyline (No Water Crossings) */}
        {roadPolyline.length > 0 && (
          <>
            <Polyline
              positions={roadPolyline}
              pathOptions={{ color: '#0284c7', weight: 6, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }}
            />
            <Polyline
              positions={roadPolyline}
              pathOptions={{ color: '#0369a1', weight: 3.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
            />
          </>
        )}

        {/* Live Rider Marker */}
        {activeRider?.currentLocation?.lat && activeRider?.currentLocation?.lng && (
          <Marker
            position={[activeRider.currentLocation.lat, activeRider.currentLocation.lng]}
            icon={createRiderIcon(activeRider.name, activeRider.vehicleNumber || activeRider.plateNumber)}
          >
            <Popup>
              <div className="text-xs p-1">
                <div className="font-bold text-slate-900">{activeRider.name}</div>
                <div className="text-[11px] text-slate-500">{activeRider.phone}</div>
                <div className="text-[10px] text-emerald-600 font-bold mt-1">Live Enroute GPS Active</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Collection Stops */}
        {stops.map((stop, idx) => {
          if (!stop.lat || !stop.lng) return null;
          const isCompleted = stop.status === 'picked_up' || stop.status === 'collected';
          return (
            <Marker
              key={stop.id || `stop-${idx}`}
              position={[stop.lat, stop.lng]}
              icon={createStopIcon(idx, stop.name || `Stop ${idx + 1}`, isCompleted)}
            >
              <Popup>
                <div className="text-xs p-1">
                  <div className="font-bold text-slate-900">{stop.name}</div>
                  <div className="text-[11px] text-slate-500">{stop.address}</div>
                  <div className="text-[10px] text-sky-700 font-bold mt-1">
                    Status: {stop.status ? stop.status.toUpperCase() : 'PENDING'}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Destination Lab Marker */}
        {destination?.lat && destination?.lng && (
          <Marker
            position={[destination.lat, destination.lng]}
            icon={createDestinationIcon(destination.name)}
          >
            <Popup>
              <div className="text-xs p-1">
                <div className="font-bold text-slate-900">{destination.name || 'Central Lab'}</div>
                <div className="text-[11px] text-slate-500">{destination.address}</div>
                <div className="text-[10px] text-emerald-700 font-bold mt-1">Final Intake Destination</div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};