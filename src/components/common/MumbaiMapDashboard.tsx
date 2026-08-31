import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import {
  PickupBoy,
  PickupTask,
  Client,
  LocationPing,
  AttendanceRecord
} from '../../types';
import { CloudSync, parseFirestoreGeoPoint } from '../../services/firebase';
import {
  MUMBAI_LANDMARKS
} from '../../services/mumbaiSeed';
import {
  MapPin,
  Bike,
  Navigation,
  Layers,
  Crosshair,
  Radio,
  Building2,
  Package,
  Thermometer,
  Battery,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Sparkles,
  ChevronRight,
  Database,
  Eye,
  SlidersHorizontal,
  Compass
} from 'lucide-react';

export const MUMBAI_CENTER: [number, number] = [19.0760, 72.8777];
export const DEFAULT_MUMBAI_ZOOM = 12;

export interface MumbaiMapDashboardProps {
  initialRiders?: PickupBoy[];
  initialTasks?: PickupTask[];
  initialClients?: Client[];
  onOpenProof?: (task: PickupTask) => void;
  onRefreshData?: () => void;
  height?: string;
  showSidebarByDefault?: boolean;
}

export const MumbaiMapDashboard: React.FC<MumbaiMapDashboardProps> = ({
  initialRiders = [],
  initialTasks = [],
  initialClients = [],
  onOpenProof,
  onRefreshData,
  height = '620px',
  showSidebarByDefault = true
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const polylinesLayerRef = useRef<L.LayerGroup | null>(null);
  const trailLayerRef = useRef<L.LayerGroup | null>(null);
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());

  // Firestore Real-time synced state
  const [cloudRiders, setCloudRiders] = useState<PickupBoy[]>(initialRiders);
  const [cloudTasks, setCloudTasks] = useState<PickupTask[]>(initialTasks);
  const [cloudClients, setCloudClients] = useState<Client[]>(initialClients);
  const [cloudPings, setCloudPings] = useState<LocationPing[]>([]);
  const [isFirestoreConnected, setIsFirestoreConnected] = useState<boolean>(false);

  // UI state
  const [selectedArea, setSelectedArea] = useState<string>('All Areas');
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'riders' | 'tasks' | 'landmarks'>('riders');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Layer toggles
  const [showRidersLayer, setShowRidersLayer] = useState<boolean>(true);
  const [showTasksLayer, setShowTasksLayer] = useState<boolean>(true);
  const [showClientsLayer, setShowClientsLayer] = useState<boolean>(true);
  const [showRoutesLayer, setShowRoutesLayer] = useState<boolean>(true);
  const [showTrailLayer, setShowTrailLayer] = useState<boolean>(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(showSidebarByDefault);

  // Available Areas in Mumbai
  const areasList = [
    'All Areas',
    'Western Suburbs',
    'Central & South Mumbai',
    'Navi Mumbai',
    'Eastern Suburbs'
  ];

  // 1. Subscribe to real-time Firestore collections with GeoPoint support
  useEffect(() => {
    let mounted = true;
    console.log('[MumbaiMapDashboard] Initializing real-time Firestore listeners...');

    const unsubRiders = CloudSync.subscribeToRiders((riders) => {
      if (!mounted) return;
      if (riders && riders.length > 0) {
        setCloudRiders(riders);
        setIsFirestoreConnected(true);
      }
    });

    const unsubTasks = CloudSync.subscribeToTasks((tasks) => {
      if (!mounted) return;
      if (tasks && tasks.length > 0) {
        setCloudTasks(tasks);
        setIsFirestoreConnected(true);
      }
    });

    const unsubClients = CloudSync.subscribeToClients((clients) => {
      if (!mounted) return;
      if (clients && clients.length > 0) {
        setCloudClients(clients);
        setIsFirestoreConnected(true);
      }
    });

    const unsubLocations = CloudSync.subscribeToLocations((pings) => {
      if (!mounted) return;
      if (pings && pings.length > 0) {
        setCloudPings(pings);
        setIsFirestoreConnected(true);
      }
    });

    return () => {
      mounted = false;
      unsubRiders();
      unsubTasks();
      unsubClients();
      unsubLocations();
    };
  }, []);

  // Filtered riders based on area and search
  const filteredRiders = useMemo(() => {
    return cloudRiders.filter((r) => {
      if (selectedArea !== 'All Areas' && r.area !== selectedArea) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.name.toLowerCase().includes(q);
        const matchesVehicle = r.vehicleNumber?.toLowerCase().includes(q);
        const matchesArea = r.area?.toLowerCase().includes(q);
        if (!matchesName && !matchesVehicle && !matchesArea) return false;
      }
      return true;
    });
  }, [cloudRiders, selectedArea, searchQuery]);

  // Filtered tasks based on area, status, and search
  const filteredTasks = useMemo(() => {
    return cloudTasks.filter((t) => {
      if (selectedArea !== 'All Areas' && t.area !== selectedArea) return false;
      if (taskStatusFilter !== 'all') {
        if (taskStatusFilter === 'pending' && t.status !== 'pending' && t.status !== 'upcoming') return false;
        if (taskStatusFilter === 'in_progress' && !['in_transit', 'started', 'at_stop', 'picked_up'].includes(t.status)) return false;
        if (taskStatusFilter === 'completed' && t.status !== 'delivered') return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title?.toLowerCase().includes(q) || t.routeName?.toLowerCase().includes(q);
        const matchesRider = t.riderName?.toLowerCase().includes(q);
        const matchesClient = t.clientName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesRider && !matchesClient) return false;
      }
      return true;
    });
  }, [cloudTasks, selectedArea, taskStatusFilter, searchQuery]);

  // Filtered landmarks
  const filteredLandmarks = useMemo(() => {
    return Object.values(MUMBAI_LANDMARKS).filter((lm) => {
      if (selectedArea !== 'All Areas' && lm.area !== selectedArea) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return lm.name.toLowerCase().includes(q) || lm.address.toLowerCase().includes(q);
      }
      return true;
    });
  }, [selectedArea, searchQuery]);

  // 2. Initialize Leaflet Map Centered on Mumbai
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: MUMBAI_CENTER,
        zoom: DEFAULT_MUMBAI_ZOOM,
        zoomControl: false,
        attributionControl: false
      });

      L.control.zoom({ position: 'topleft' }).addTo(map);

      // Clean, high-contrast healthcare tile layer (CartoDB Positron / Voyager)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(map);

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

  // 3. Reset map to Mumbai Center
  const handleResetToMumbai = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(MUMBAI_CENTER, DEFAULT_MUMBAI_ZOOM, {
        animate: true,
        duration: 0.8
      });
    }
  };

  // 4. Focus on specific coordinates
  const handleFocusPoint = (lat: number, lng: number, zoomLevel: number = 14, markerKey?: string) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], zoomLevel, {
        animate: true,
        duration: 0.8
      });
      if (markerKey && markersMapRef.current.has(markerKey)) {
        const marker = markersMapRef.current.get(markerKey);
        marker?.openPopup();
      }
    }
  };

  // 5. Fit bounds to all active elements
  const handleFitBounds = () => {
    if (!mapInstanceRef.current) return;
    const points: L.LatLngExpression[] = [];

    filteredRiders.forEach((r) => {
      if (r.currentLocation) {
        const coords = parseFirestoreGeoPoint(r.currentLocation.location) || {
          lat: r.currentLocation.lat,
          lng: r.currentLocation.lng
        };
        points.push([coords.lat, coords.lng]);
      }
    });

    filteredTasks.forEach((t) => {
      if (t.pickupLocation) points.push([t.pickupLocation.lat, t.pickupLocation.lng]);
      if (t.deliveryLocation) points.push([t.deliveryLocation.lat, t.deliveryLocation.lng]);
    });

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else {
      handleResetToMumbai();
    }
  };

  // 6. Render Markers, Polylines, and Popups on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const polylinesLayer = polylinesLayerRef.current;
    const trailLayer = trailLayerRef.current;
    if (!map || !markersLayer || !polylinesLayer || !trailLayer) return;

    markersLayer.clearLayers();
    polylinesLayer.clearLayers();
    trailLayer.clearLayers();
    markersMapRef.current.clear();

    // A. RENDER RIDERS
    if (showRidersLayer) {
      filteredRiders.forEach((r) => {
        if (!r.currentLocation) return;
        const coords = parseFirestoreGeoPoint(r.currentLocation.location) || {
          lat: r.currentLocation.lat,
          lng: r.currentLocation.lng
        };
        if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;

        const isSelected = selectedRiderId === r.id;
        const assignedTask = cloudTasks.find((t) => t.riderId === r.id || t.assignedRiderId === r.id);

        const riderName = r.name || 'Courier';
        const vehicleNum = r.vehicleNumber || 'MH-02-BIKE';
        const firstName = riderName.split(' ')[0] || riderName;
        const vehicleSuffix = vehicleNum.includes('-') ? vehicleNum.split('-').pop() : vehicleNum;

        const riderIcon = L.divIcon({
          className: 'custom-mumbai-rider',
          html: `
            <div class="relative group cursor-pointer">
              <div class="absolute -inset-2 bg-sky-500 rounded-full animate-ping opacity-75"></div>
              <div class="relative w-10 h-10 rounded-full ${
                isSelected ? 'bg-slate-950 ring-4 ring-sky-400' : 'bg-slate-900 ring-2 ring-sky-500'
              } text-white flex items-center justify-center shadow-xl transform transition-transform group-hover:scale-110">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
                <span class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white animate-pulse"></span>
              </div>
              <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-950/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap shadow-lg border border-slate-700 flex items-center gap-1.5 pointer-events-none">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>${firstName}</span>
                <span class="text-sky-300 font-mono text-[9px]">${vehicleSuffix || 'BIKE'}</span>
              </div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        const marker = L.marker([coords.lat, coords.lng], {
          icon: riderIcon,
          zIndexOffset: 1200
        }).addTo(markersLayer);

        marker.on('click', () => {
          setSelectedRiderId(r.id);
          setSidebarTab('riders');
        });

        marker.bindPopup(`
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 230px; padding: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">
              <span style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px;">Live GPS Specimen Courier</span>
              <span style="font-size: 9px; font-weight: 700; background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 9999px; border: 1px solid #a7f3d0;">ONLINE</span>
            </div>
            
            <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${riderName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 1px;">${r.vehicleType || 'Motorcycle'} • <span style="font-family: monospace; font-weight: 600;">${vehicleNum}</span></div>
            <div style="font-size: 11px; color: #0284c7; font-weight: 600; margin-top: 2px;">📍 Area: ${r.area || 'Mumbai Central'}</div>
            
            <div style="margin-top: 8px; padding: 6px 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 11px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #64748b;">Cold-Box Chiller:</span>
                <span style="font-weight: 700; color: #047857; font-family: monospace;">4.0°C (Safe 2-8°C)</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #64748b;">Device Battery:</span>
                <span style="font-weight: 700; color: #0f172a; font-family: monospace;">${r.batteryLevel || 90}%</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Assigned Task:</span>
                <span style="font-weight: 700; color: #0369a1;">${assignedTask?.title || assignedTask?.routeName || 'Western Suburbs Loop'}</span>
              </div>
            </div>
            
            <div style="margin-top: 6px; font-size: 11px; color: #334155;">
              <b>Phone:</b> ${r.phone}
            </div>
          </div>
        `);

        markersMapRef.current.set(`rider-${r.id}`, marker);

        // Draw active task polyline connecting rider to pickup and delivery
        if (showRoutesLayer && assignedTask) {
          const riderPoint: [number, number] = [coords.lat, coords.lng];
          const pickupPoint: [number, number] | null = assignedTask.pickupLocation
            ? [assignedTask.pickupLocation.lat, assignedTask.pickupLocation.lng]
            : null;
          const deliveryPoint: [number, number] | null = assignedTask.deliveryLocation
            ? [assignedTask.deliveryLocation.lat, assignedTask.deliveryLocation.lng]
            : null;

          // Leg 1: Rider -> Pickup
          if (pickupPoint) {
            L.polyline([riderPoint, pickupPoint], {
              color: '#0284c7',
              weight: 4,
              opacity: 0.85,
              dashArray: '6, 8',
              lineCap: 'round'
            }).addTo(polylinesLayer);
          }

          // Leg 2: Pickup -> Delivery Lab
          if (pickupPoint && deliveryPoint) {
            L.polyline([pickupPoint, deliveryPoint], {
              color: '#059669',
              weight: 3.5,
              opacity: 0.75,
              dashArray: '4, 6',
              lineCap: 'round'
            }).addTo(polylinesLayer);
          }
        }
      });
    }

    // B. RENDER TASK PICKUP & DELIVERY MARKERS
    if (showTasksLayer) {
      filteredTasks.forEach((t, idx) => {
        // Pickup Marker
        if (t.pickupLocation) {
          const isUrgent = t.priority === 'urgent';
          const isPickedUp = t.status === 'in_transit' || t.status === 'delivered';
          const pickupName = t.pickupLocation.name || 'Pickup Point';
          const shortPickupName = pickupName.split(' ')[0] || pickupName;

          const pickupIcon = L.divIcon({
            className: 'custom-pickup-marker',
            html: `
              <div class="relative group cursor-pointer">
                <div class="w-8 h-8 rounded-full ${
                  isPickedUp
                    ? 'bg-emerald-600 ring-2 ring-emerald-300'
                    : isUrgent
                    ? 'bg-rose-600 ring-3 ring-rose-300 animate-bounce'
                    : 'bg-indigo-600 ring-2 ring-indigo-300'
                } text-white font-bold text-xs flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-115">
                  <span>${isPickedUp ? '✓' : `P${idx + 1}`}</span>
                </div>
                <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs border border-slate-200 whitespace-nowrap">
                  ${shortPickupName}
                </div>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          const pMarker = L.marker([t.pickupLocation.lat, t.pickupLocation.lng], {
            icon: pickupIcon,
            zIndexOffset: 800
          }).addTo(markersLayer);

          pMarker.on('click', () => {
            setSelectedTaskId(t.id);
            setSidebarTab('tasks');
          });

          pMarker.bindPopup(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 220px; padding: 4px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 10px; font-weight: 800; color: #4338ca; text-transform: uppercase;">Pickup Location</span>
                <span style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 9999px; background: ${
                  t.priority === 'urgent' ? '#ffe4e6; color: #be123c;' : '#e0e7ff; color: #4338ca;'
                }">${t.priority?.toUpperCase() || 'NORMAL'}</span>
              </div>
              <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${pickupName}</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${t.pickupLocation.address || 'Mumbai'}</div>
              <div style="margin-top: 6px; font-size: 11px; color: #334155;">
                <b>Task:</b> ${t.title || t.routeName}<br/>
                <b>Assigned Courier:</b> ${t.riderName || 'Rahul Sharma'}<br/>
                <b>Status:</b> ${t.status.toUpperCase()}
              </div>
            </div>
          `);

          markersMapRef.current.set(`pickup-${t.id}`, pMarker);
        }

        // Delivery Destination Lab Marker
        if (t.deliveryLocation) {
          const deliveryName = t.deliveryLocation.name || 'Central Lab';
          const shortDeliveryName = deliveryName.split(' ')[0] || deliveryName;

          const destIcon = L.divIcon({
            className: 'custom-dest-marker',
            html: `
              <div class="relative group cursor-pointer">
                <div class="w-8 h-8 rounded-lg bg-emerald-700 ring-2 ring-emerald-300 text-white font-bold text-xs flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-115">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/><path d="M8 14h8"/><path d="M12 10v8"/></svg>
                </div>
                <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-emerald-950 text-emerald-200 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs border border-emerald-800 whitespace-nowrap">
                  ${shortDeliveryName}
                </div>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          const dMarker = L.marker([t.deliveryLocation.lat, t.deliveryLocation.lng], {
            icon: destIcon,
            zIndexOffset: 750
          }).addTo(markersLayer);

          dMarker.bindPopup(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 210px; padding: 4px;">
              <span style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase;">Central Diagnostic Intake Lab</span>
              <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px;">${deliveryName}</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${t.deliveryLocation.address || 'Mumbai'}</div>
              <div style="margin-top: 6px; font-size: 11px; color: #334155;">
                <b>Expected Intake:</b> ${t.timeSlot || '14:00'}<br/>
                <b>Cold Chain SLA:</b> 2.0°C – 8.0°C Verified
              </div>
            </div>
          `);

          markersMapRef.current.set(`dest-${t.id}`, dMarker);
        }
      });
    }

    // C. RENDER MUMBAI CLIENT LANDMARKS
    if (showClientsLayer) {
      filteredLandmarks.forEach((lm) => {
        const landmarkName = lm.name || 'Landmark';
        const shortLandmarkName = landmarkName.split(' ')[0] || landmarkName;

        const landmarkIcon = L.divIcon({
          className: 'custom-mumbai-landmark',
          html: `
            <div class="relative group cursor-pointer">
              <div class="w-6 h-6 rounded-md bg-amber-600 ring-2 ring-amber-300 text-white flex items-center justify-center shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
              </div>
              <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-amber-950 text-amber-200 text-[8px] font-bold px-1 rounded whitespace-nowrap">
                ${shortLandmarkName}
              </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const lmMarker = L.marker([lm.lat, lm.lng], {
          icon: landmarkIcon,
          zIndexOffset: 600
        }).addTo(markersLayer);

        lmMarker.bindPopup(`
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 220px; padding: 4px;">
            <span style="font-size: 10px; font-weight: 800; color: #d97706; text-transform: uppercase;">Mumbai Landmark Hub</span>
            <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px;">${landmarkName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${lm.address}</div>
            <div style="font-size: 11px; color: #0284c7; font-weight: 600; margin-top: 3px;">📍 ${lm.area}</div>
            <p style="font-size: 11px; color: #475569; margin-top: 5px; line-height: 1.4;">${lm.description}</p>
          </div>
        `);

        markersMapRef.current.set(`landmark-${lm.key}`, lmMarker);
      });
    }

    // D. RENDER GPS TRAIL BREADCRUMBS
    if (showTrailLayer && cloudPings.length > 0) {
      const trailCoords: [number, number][] = cloudPings
        .map((p) => {
          const coords = parseFirestoreGeoPoint(p.location) || { lat: p.lat, lng: p.lng };
          return [coords.lat, coords.lng] as [number, number];
        })
        .filter((coord) => typeof coord[0] === 'number' && typeof coord[1] === 'number');

      if (trailCoords.length > 1) {
        L.polyline(trailCoords, {
          color: '#0284c7',
          weight: 3,
          opacity: 0.6,
          dashArray: '3, 6',
          lineCap: 'round'
        }).addTo(trailLayer);
      }
    }
  }, [
    filteredRiders,
    filteredTasks,
    filteredLandmarks,
    cloudTasks,
    cloudPings,
    selectedRiderId,
    selectedTaskId,
    showRidersLayer,
    showTasksLayer,
    showClientsLayer,
    showRoutesLayer,
    showTrailLayer
  ]);

  return (
    <div className="flex flex-col lg:flex-row w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
      {/* 1. Main Map Canvas Container */}
      <div className="relative flex-1 bg-slate-100 flex flex-col min-h-[480px]" style={{ height }}>
        {/* Top Floating Map Control Bar */}
        <div className="absolute top-3 left-14 z-[400] flex flex-wrap items-center gap-2 max-w-[calc(100%-160px)]">
          {/* Mumbai Reset Control */}
          <button
            onClick={handleResetToMumbai}
            className="px-2.5 py-1 bg-white/95 backdrop-blur-xs hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-lg border border-slate-200 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Center on Mumbai (19.0760° N, 72.8777° E)"
          >
            <Crosshair className="w-3.5 h-3.5 text-sky-700" />
            <span>Mumbai Center (Zoom 12)</span>
          </button>

          {/* Fit Fleet Bounds */}
          <button
            onClick={handleFitBounds}
            className="px-2.5 py-1 bg-white/95 backdrop-blur-xs hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Fit view to all active riders and tasks"
          >
            <Navigation className="w-3.5 h-3.5 text-slate-600" />
            <span>Fit Fleet</span>
          </button>

          {/* Area Filter Select */}
          <div className="flex items-center bg-white/95 backdrop-blur-xs rounded-lg border border-slate-200 shadow-xs px-2 py-0.5">
            <Compass className="w-3.5 h-3.5 text-sky-700 mr-1.5" />
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              aria-label="Filter Map By Mumbai Area"
              className="text-xs font-semibold text-slate-800 bg-transparent border-0 focus:outline-none cursor-pointer py-0.5"
            >
              {areasList.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Top Right Live Firestore Status Pill & Sidebar Toggle */}
        <div className="absolute top-3 right-3 z-[400] flex items-center gap-2">
          {/* Real-time Status */}
          <div className="bg-slate-950/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-700 text-xs font-bold text-white flex items-center gap-2 shadow-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px]">
              {isFirestoreConnected ? 'Firestore Live GeoPoint' : 'Live Fleet Radar'}
            </span>
            <span className="text-[10px] text-sky-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
              {filteredRiders.length} Riders
            </span>
          </div>

          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="px-2.5 py-1 bg-white/95 backdrop-blur-xs hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-lg border border-slate-200 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Toggle Live Sidebar"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
            <span>{isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}</span>
          </button>
        </div>

        {/* Map Stage */}
        <div ref={mapContainerRef} className="flex-1 w-full z-0" />

        {/* Bottom Layer Controls & Legend Bar */}
        <div className="absolute bottom-3 left-3 right-3 z-[400] bg-white/95 backdrop-blur-xs px-3 py-2 rounded-xl border border-slate-200 shadow-md flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Layer toggles */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-600" />
              Layers:
            </span>

            <button
              onClick={() => setShowRidersLayer(!showRidersLayer)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                showRidersLayer ? 'bg-sky-100 text-sky-800 border border-sky-300' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Bike className="w-3 h-3 inline mr-1" />
              Riders ({filteredRiders.length})
            </button>

            <button
              onClick={() => setShowTasksLayer(!showTasksLayer)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                showTasksLayer ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Package className="w-3 h-3 inline mr-1" />
              Tasks ({filteredTasks.length})
            </button>

            <button
              onClick={() => setShowClientsLayer(!showClientsLayer)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                showClientsLayer ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Building2 className="w-3 h-3 inline mr-1" />
              Landmarks ({filteredLandmarks.length})
            </button>

            <button
              onClick={() => setShowRoutesLayer(!showRoutesLayer)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                showRoutesLayer ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500'
              }`}
            >
              Polylines
            </button>

            <button
              onClick={() => setShowTrailLayer(!showTrailLayer)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                showTrailLayer ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-500'
              }`}
            >
              GPS Trail
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Sidebar Panel */}
      {isSidebarOpen && (
        <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50/70 flex flex-col h-[480px] lg:h-auto overflow-hidden">
          {/* Sidebar Header with Area & Search */}
          <div className="p-3.5 bg-white border-b border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-xs sm:text-sm">Mumbai Fleet Control</h3>
                  <p className="text-[11px] text-slate-500">Real-time specimen logistics</p>
                </div>
              </div>

              {/* Area Badge */}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                {selectedArea}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rider, landmark, task..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white"
              />
            </div>

            {/* Sidebar Navigation Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
              <button
                onClick={() => setSidebarTab('riders')}
                className={`py-1 rounded-md text-center transition-all cursor-pointer ${
                  sidebarTab === 'riders' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Riders ({filteredRiders.length})
              </button>
              <button
                onClick={() => setSidebarTab('tasks')}
                className={`py-1 rounded-md text-center transition-all cursor-pointer ${
                  sidebarTab === 'tasks' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Tasks ({filteredTasks.length})
              </button>
              <button
                onClick={() => setSidebarTab('landmarks')}
                className={`py-1 rounded-md text-center transition-all cursor-pointer ${
                  sidebarTab === 'landmarks' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Landmarks ({filteredLandmarks.length})
              </button>
            </div>
          </div>

          {/* Sidebar Content Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {/* TAB 1: RIDERS LIST */}
            {sidebarTab === 'riders' && (
              <div className="space-y-2">
                {filteredRiders.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No active riders in {selectedArea}
                  </div>
                ) : (
                  filteredRiders.map((r) => {
                    const isSelected = selectedRiderId === r.id;
                    const assignedTask = cloudTasks.find((t) => t.riderId === r.id || t.assignedRiderId === r.id);
                    const coords = r.currentLocation
                      ? parseFirestoreGeoPoint(r.currentLocation.location) || {
                          lat: r.currentLocation.lat,
                          lng: r.currentLocation.lng
                        }
                      : null;

                    return (
                      <div
                        key={r.id}
                        onClick={() => {
                          setSelectedRiderId(r.id);
                          if (coords) handleFocusPoint(coords.lat, coords.lng, 15, `rider-${r.id}`);
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer bg-white ${
                          isSelected
                            ? 'border-sky-500 ring-2 ring-sky-200 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={r.photoUrl}
                              alt={r.name}
                              className="w-8 h-8 rounded-full object-cover border border-slate-300"
                            />
                            <div>
                              <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                <span>{r.name}</span>
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {r.vehicleNumber} • {r.area || 'Mumbai'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            <Battery className="w-3 h-3 text-emerald-600" />
                            <span>{r.batteryLevel || 90}%</span>
                          </div>
                        </div>

                        {/* Assigned Task Preview */}
                        {assignedTask && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px]">
                            <div className="flex items-center justify-between text-slate-500 mb-0.5">
                              <span className="font-semibold text-sky-700">Active Task:</span>
                              <span className="uppercase text-[9px] font-extrabold px-1.5 py-0.2 bg-sky-100 text-sky-800 rounded">
                                {assignedTask.status}
                              </span>
                            </div>
                            <div className="font-medium text-slate-800 line-clamp-1">
                              {assignedTask.title || assignedTask.routeName}
                            </div>
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                          <span className="flex items-center gap-1 text-emerald-700 font-bold">
                            <Thermometer className="w-3 h-3" />
                            4.0°C Chiller
                          </span>
                          <span className="text-sky-700 font-semibold flex items-center gap-0.5 hover:underline">
                            Focus on Map
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: TASKS LIST */}
            {sidebarTab === 'tasks' && (
              <div className="space-y-2">
                {/* Task Status Filter Chips */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
                  {(['all', 'in_progress', 'pending', 'completed'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setTaskStatusFilter(st)}
                      className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap transition-all cursor-pointer ${
                        taskStatusFilter === st
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {st === 'all' ? 'All Tasks' : st.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {filteredTasks.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No tasks found matching criteria
                  </div>
                ) : (
                  filteredTasks.map((t) => {
                    const isSelected = selectedTaskId === t.id;
                    const isUrgent = t.priority === 'urgent';

                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedTaskId(t.id);
                          if (t.pickupLocation) {
                            handleFocusPoint(t.pickupLocation.lat, t.pickupLocation.lng, 15, `pickup-${t.id}`);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer bg-white ${
                          isSelected
                            ? 'border-indigo-500 ring-2 ring-indigo-200 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-slate-900 text-xs line-clamp-1">
                            {t.title || t.routeName}
                          </div>
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                              isUrgent
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {t.priority || 'NORMAL'}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 mt-1">
                          <b>Area:</b> {t.area || 'Mumbai Central'} • <b>Slot:</b> {t.timeSlot || '14:00'}
                        </div>

                        <div className="mt-2 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100 space-y-1">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            <span className="font-semibold">From:</span> {t.pickupLocation?.name || 'Clinic'}
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span className="font-semibold">To:</span> {t.deliveryLocation?.name || 'Central Lab'}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <span className="text-slate-600">
                            <b>Rider:</b> {t.riderName || 'Unassigned'}
                          </span>
                          {onOpenProof && t.status === 'delivered' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenProof(t);
                              }}
                              className="text-[10px] font-bold text-sky-700 hover:underline flex items-center gap-0.5"
                            >
                              <Eye className="w-3 h-3" />
                              View Proof
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 3: MUMBAI LANDMARKS */}
            {sidebarTab === 'landmarks' && (
              <div className="space-y-2">
                {filteredLandmarks.map((lm) => (
                  <div
                    key={lm.key}
                    onClick={() => handleFocusPoint(lm.lat, lm.lng, 15, `landmark-${lm.key}`)}
                    className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-white hover:bg-amber-50/40 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-bold text-slate-900 text-xs">{lm.name}</div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                        {lm.area}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{lm.address}</div>
                    <p className="text-[10px] text-slate-600 mt-2 bg-slate-50 p-1.5 rounded border border-slate-100">
                      {lm.description}
                    </p>
                    <div className="mt-2 text-right">
                      <span className="text-[10px] font-bold text-amber-700 hover:underline flex items-center justify-end gap-0.5">
                        Focus Hub <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
