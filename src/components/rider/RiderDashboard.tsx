import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAuth, PickupTask, Route, PickupBoy, StopProgress, TaskStatus, RiderSession, StopStatus } from '../../types';
import {
  Bike,
  MapPin,
  Clock,
  PhoneCall,
  Navigation,
  Camera,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Radio,
  Thermometer,
  ShieldCheck,
  Package,
  Plus,
  Minus,
  ArrowRight,
  UploadCloud,
  Check,
  X,
  Battery,
  Wifi,
  WifiOff,
  UserCheck,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  FileText,
  Inbox,
  LogOut,
  Edit2,
  Lock,
  Upload,
  Loader2
} from 'lucide-react';
import { addWatermarkToImage, compressImageToBase64 } from '../../services/imageWatermark';
import { StorageService } from '../../services/storage';
import { LocationService, GpsStatusEvent } from '../../services/locationService';
import { NotificationService } from '../../services/notificationService';
import { LiveMap } from '../common/LiveMap';
import { CloudSync, db, formatUnifiedTask } from '../../services/firebase';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { DailyRoundsSchedule, ScheduleStopItem } from './DailyRoundsSchedule';
import {
  evaluateRiderPunctuality,
  getRiderFirstRouteSlot,
  parseSlotToMinutes,
  PunctualityReport
} from '../../utils/riderTelemetry';
import { getLiveBatteryInfo, subscribeToBatteryChanges } from '../../utils/deviceBattery';

interface RiderDashboardProps {
  user: UserAuth;
  tasks: PickupTask[];
  routes: Route[];
  rider?: PickupBoy;
  onRefresh: () => void;
  onOpenProof: (task: PickupTask) => void;
}

export const RiderDashboard: React.FC<RiderDashboardProps> = ({
  user,
  tasks,
  routes,
  rider,
  onRefresh,
  onOpenProof
}) => {
  const navigate = useNavigate();

  // Validate active authenticated rider session from localStorage ('vialtrack_rider_session')
  const getRiderSession = (): RiderSession | null => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('vialtrack_rider_session') : null;
      if (raw) return JSON.parse(raw);
    } catch (err) {
      console.warn('Error reading vialtrack_rider_session:', err);
    }
    return null;
  };

  const session = getRiderSession();

  // Route guard: if session data is invalid or missing, clear storage and redirect to /rider/login
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('vialtrack_rider_session') : null;
    let sess: RiderSession | null = null;
    try {
      if (raw) sess = JSON.parse(raw);
    } catch {
      sess = null;
    }
    if (!sess || sess.role !== 'rider' || !sess.riderId) {
      StorageService.clearPortalSession('rider');
      navigate('/rider/login', { replace: true });
    }
  }, [navigate]);

  const activeRider: PickupBoy = rider || {
    id: session?.riderId || user?.riderId || '',
    name: session?.name || user?.name || 'Courier Partner',
    email: session?.email || user?.email || '',
    phone: session?.phone || user?.phone || '',
    photoUrl: user?.avatar || '',
    vehicleNumber: '',
    vehicleType: 'Motorcycle / Bike',
    assignedRouteIds: [],
    status: 'active',
    joiningDate: new Date().toISOString().split('T')[0],
    isOnline: true,
    isCheckedIn: true
  };

  // Active identity keys strictly for this rider
  const sessionRiderId = session?.riderId || user?.riderId || activeRider.id;
  const sessionPhone = session?.phone || user?.phone || activeRider.phone || '';
  const sessionName = session?.name || user?.name || activeRider.name || '';

  const normalizePhone = (p?: string) => (p || '').replace(/\D/g, '');
  const normalizedSessionPhone = normalizePhone(sessionPhone);

  // Local synced state for real-time Firestore listeners
  const [liveTasks, setLiveTasks] = useState<PickupTask[]>([]);
  const [liveRoutes, setLiveRoutes] = useState<Route[]>([]);

  // Real-time Firestore snapshot listeners strictly scoped to active rider identity
  useEffect(() => {
    if (!sessionRiderId) return;

    const unsubTrips = CloudSync.subscribeToRiderTrips(sessionRiderId, sessionPhone, (cloudTrips) => {
      if (cloudTrips && cloudTrips.length > 0) {
        const formatted = cloudTrips.map((t) => formatUnifiedTask(t.id, t));
        setLiveTasks((prev) => {
          const map = new Map<string, PickupTask>();
          prev.forEach((item) => map.set(item.id, item));
          formatted.forEach((item) => map.set(item.id, item));
          return Array.from(map.values());
        });
      }
    });

    const unsubTasks = CloudSync.subscribeToRiderTasks(sessionRiderId, sessionPhone, (cloudTasks) => {
      if (cloudTasks) {
        setLiveTasks((prev) => {
          const map = new Map<string, PickupTask>();
          prev.forEach((item) => map.set(item.id, item));
          cloudTasks.forEach((item) => map.set(item.id, item));
          return Array.from(map.values());
        });
      }
    });

    const unsubRoutes = CloudSync.subscribeToRiderRoutes(sessionRiderId, sessionPhone, (cloudRoutes) => {
      if (cloudRoutes) {
        setLiveRoutes(cloudRoutes);
      }
    });

    const unsubRiderDoc = CloudSync.subscribeToRiderDocument(sessionRiderId, (cloudRider) => {
      if (cloudRider && cloudRider.isCheckedIn !== undefined) {
        setIsCheckedIn(cloudRider.isCheckedIn);
      }
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'organization'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.opsHotline) {
          setOpsHotline(data.opsHotline);
        }
      }
    });

    return () => {
      unsubTrips();
      unsubTasks();
      unsubRoutes();
      unsubRiderDoc();
      unsubSettings();
    };
  }, [sessionRiderId, sessionPhone]);

  const [opsHotline, setOpsHotline] = useState<string>('+91 93216 40508');
  const [isCheckedIn, setIsCheckedIn] = useState<boolean>(activeRider.isCheckedIn ?? true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState<number>(0);
  const [isProcessingStop, setIsProcessingStop] = useState<boolean>(false);
  const [isProcessingDrop, setIsProcessingDrop] = useState<boolean>(false);

  // Stop collection 2-Photo proof state
  const [vialCount, setVialCount] = useState<number>(1);
  const [coldBoxTemp, setColdBoxTemp] = useState<number>(4.0);
  const [pickupRemarkType, setPickupRemarkType] = useState<'Collected sample' | 'No Sample' | 'Other'>('Collected sample');
  const [pickupCustomRemark, setPickupCustomRemark] = useState<string>('');
  const [stopPhoto, setStopPhoto] = useState<string | null>(null); // Photo 1: Specimen Vials
  const [stopPhoto2, setStopPhoto2] = useState<string | null>(null); // Photo 2: Rider Location Selfie
  const [pickupFormError, setPickupFormError] = useState<string | null>(null);
  const [dropFormError, setDropFormError] = useState<string | null>(null);
  const [receiverName, setReceiverName] = useState<string>('');
  const [delayReason, setDelayReason] = useState<string>('Heavy Traffic / Rain');
  const [showDelayModal, setShowDelayModal] = useState<boolean>(false);
  const [watermarking, setWatermarking] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [showLiveMap, setShowLiveMap] = useState<boolean>(true);

  // Vehicle Type & Number state with persistence to Firestore
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>(
    (session as any)?.vehicleType || activeRider.vehicleType || 'Motorcycle / Bike'
  );
  const [selectedVehicleNumber, setSelectedVehicleNumber] = useState<string>(
    (session as any)?.vehicleNo || (session as any)?.vehicleNumber || activeRider.vehicleNumber || ''
  );
  const [showVehicleDutyModal, setShowVehicleDutyModal] = useState<boolean>(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState<boolean>(false);

  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileGalleryRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const fileGalleryRef2 = useRef<HTMLInputElement>(null);
  const dropFileInputRef = useRef<HTMLInputElement>(null);
  const dropGalleryRef = useRef<HTMLInputElement>(null);

  // Restrict Browser Back Navigation on Rider App
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handleBackButton = () => {
      window.history.pushState(null, '', window.location.href);
      setShowExitConfirmModal(true);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isCheckedIn) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('popstate', handleBackButton);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('popstate', handleBackButton);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isCheckedIn]);

  // Online / Offline monitor
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Heartbeat & Live App Open Telemetry Sync to Firestore
  useEffect(() => {
    if (!sessionRiderId) return;

    const pulseHeartbeat = async (overrideBattery?: number) => {
      try {
        let batteryPct = overrideBattery;
        if (typeof batteryPct !== 'number') {
          const battInfo = await getLiveBatteryInfo();
          batteryPct = battInfo.level;
        }

        await setDoc(
          doc(db, 'riders', sessionRiderId),
          {
            id: sessionRiderId,
            name: activeRider.name,
            phone: activeRider.phone,
            isAppOpen: true,
            appOpenTime: (activeRider as any).appOpenTime || new Date().toISOString(),
            lastHeartbeatTime: new Date().toISOString(),
            lastHeartbeat: serverTimestamp(),
            lastUpdated: serverTimestamp(),
            battery: batteryPct,
            batteryLevel: batteryPct,
            isOnline: true
          },
          { merge: true }
        );
      } catch (err) {
        // Ignore silent network/quota notice
      }
    };

    pulseHeartbeat();
    const interval = setInterval(() => pulseHeartbeat(), 20000);

    // Also trigger immediate sync whenever device battery changes (e.g. plugged in or dropped)
    const unsubBattery = subscribeToBatteryChanges((info) => {
      pulseHeartbeat(info.level);
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        pulseHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      unsubBattery();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sessionRiderId, activeRider.name, activeRider.phone, (activeRider as any).appOpenTime]);

  // Today ISO Date string
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Data Matching: check if a task is strictly assigned to this rider
  const isTaskAssignedToRider = (t: PickupTask) => {
    if (!t) return false;
    if (t.riderId && (t.riderId === sessionRiderId || t.riderId === activeRider.id)) return true;
    if (t.assignedRiderId && (t.assignedRiderId === sessionRiderId || t.assignedRiderId === activeRider.id)) return true;
    if (normalizedSessionPhone && t.riderPhone && normalizePhone(t.riderPhone) === normalizedSessionPhone) return true;
    if (sessionName && t.riderName && t.riderName.trim().toLowerCase() === sessionName.trim().toLowerCase()) return true;
    return false;
  };

  // Data Matching: check if a route is strictly assigned to this rider
  const isRouteAssignedToRider = (r: Route) => {
    if (!r) return false;
    if (r.assignedRiderId && (r.assignedRiderId === sessionRiderId || r.assignedRiderId === activeRider.id)) return true;
    if (normalizedSessionPhone && (r as any).assignedRiderPhone && normalizePhone((r as any).assignedRiderPhone) === normalizedSessionPhone) return true;
    if (sessionName && (r as any).assignedRiderName && (r as any).assignedRiderName.trim().toLowerCase() === sessionName.trim().toLowerCase()) return true;
    const riderAssignedRouteIds = Array.isArray(activeRider?.assignedRouteIds) ? activeRider.assignedRouteIds : [];
    if (riderAssignedRouteIds.includes(r.id)) return true;
    if (liveTasks.some((t) => isTaskAssignedToRider(t) && t.routeId === r.id)) return true;
    return false;
  };

  // Assigned routes list (STRICT: never fallback to other riders' routes)
  const assignedRoutes: Route[] = useMemo(() => {
    const combinedRoutes = new Map<string, Route>();
    routes.filter(isRouteAssignedToRider).forEach((r) => combinedRoutes.set(r.id, r));
    liveRoutes.filter(isRouteAssignedToRider).forEach((r) => combinedRoutes.set(r.id, r));
    return Array.from(combinedRoutes.values());
  }, [routes, liveRoutes, sessionRiderId, activeRider.id, normalizedSessionPhone, sessionName, liveTasks]);

  // Filter active / today's tasks strictly for this rider (handles today, scheduledDate, or active ongoing status)
  const todayRiderTasks: PickupTask[] = useMemo(() => {
    const combinedTasks = new Map<string, PickupTask>();
    
    const filterTask = (t: PickupTask) => {
      if (!isTaskAssignedToRider(t)) return false;
      const tDate = t.scheduledDate || t.date || (t.createdAt ? t.createdAt.split('T')[0] : '');
      const isActiveStatus = ['assigned', 'started', 'at_stop', 'picked_up', 'in_transit', 'in_progress', 'pending'].includes(t.status);
      // Show task if it's scheduled for today, or if it's an active incomplete task assigned to this rider
      return tDate === todayStr || (!tDate && isActiveStatus) || isActiveStatus;
    };

    tasks.filter(filterTask).forEach((t) => combinedTasks.set(t.id, t));
    liveTasks.filter(filterTask).forEach((t) => combinedTasks.set(t.id, t));
    
    const parseSlotMinutes = (slot?: string): number => {
      if (!slot) return 0;
      const match = slot.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
      if (!match) return 0;
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const meridiem = match[3]?.toUpperCase();
      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

    const taskList = Array.from(combinedTasks.values());
    taskList.sort((a, b) => parseSlotMinutes(a.timeSlot) - parseSlotMinutes(b.timeSlot));
    return taskList;
  }, [tasks, liveTasks, todayStr, sessionRiderId, activeRider.id, normalizedSessionPhone, sessionName]);

  // Build sequential scheduled stops for "My Daily Rounds Schedule"
  // Handles BOTH predefined route loops AND direct/ad-hoc pickup tasks (e.g. laptop pickups, hospital pickups)
  const scheduleStops: ScheduleStopItem[] = useMemo(() => {
    const items: ScheduleStopItem[] = [];
    const processedTaskIds = new Set<string>();

    // 1. Process assigned route loops
    assignedRoutes.forEach((route) => {
      // Strictly use the route's configured time slots. If none configured, show single scheduled daily run
      const timeSlots = route.timeSlots && route.timeSlots.length > 0 ? route.timeSlots : ['Scheduled Slot'];
      const client = StorageService.getClientById(route.clientId) || { 
        name: (route as any).clientName || route.destinationLab?.name || route.name 
      };

      timeSlots.forEach((slot) => {
        // Find all tasks matching this route and slot today
        const matchingTasks = todayRiderTasks.filter(
          (t) => (t.routeId === route.id || t.routeName === route.name) && (t.timeSlot === slot || !t.timeSlot)
        );

        // Mark all matching tasks as processed to prevent duplicate fallback rendering
        matchingTasks.forEach((t) => processedTaskIds.add(t.id));

        // Pick the active / most updated task for this slot
        const matchedTask = matchingTasks.length > 0 ? matchingTasks[0] : undefined;

        if (matchedTask && matchedTask.stopsProgress && matchedTask.stopsProgress.length > 0) {
          matchedTask.stopsProgress.forEach((sp, spIdx) => {
            const isCollected = sp.status === 'picked_up' || sp.status === 'completed';
            const isInTransit =
              (matchedTask.status === 'started' || matchedTask.status === 'at_stop' || matchedTask.status === 'in_transit') &&
              !isCollected;
            const status: 'pending' | 'in_transit' | 'collected' = isCollected
              ? 'collected'
              : isInTransit
              ? 'in_transit'
              : 'pending';

            items.push({
              id: `${matchedTask.id}-stop-${spIdx}`,
              uniqueKey: `${matchedTask.id}-stop-${spIdx}-${slot}`,
              stopNumber: spIdx + 1,
              stopName: sp.stopName,
              address: sp.address,
              lat: sp.lat || 19.1287852,
              lng: sp.lng || 72.8294183,
              timeSlot: matchedTask.timeSlot || slot,
              contactPerson: sp.contactPerson || 'Point of Contact',
              phone: sp.phone || '',
              status,
              vialCount: sp.sampleCount,
              coldBoxTemp: sp.coldBoxTemp,
              photoUrl: sp.photoUrl,
              photo2Url: (sp as any).handoverPhotoUrl || (sp as any).photo2Url,
              selfieUrl: (sp as any).selfieUrl,
              taskId: matchedTask.id,
              task: matchedTask,
              routeId: route.id,
              routeName: route.name,
              clientId: route.clientId,
              clientName: matchedTask.clientName || client.name,
              stopIndex: spIdx,
              order: spIdx + 1
            });
          });
        } else {
          // Resolve stops directly from assigned route definition
          const routeStops = route.stops || [];
          routeStops.forEach((rs, rsIdx) => {
            items.push({
              id: `route-${route.id}-slot-${slot.replace(':', '')}-stop-${rsIdx}`,
              uniqueKey: `route-${route.id}-slot-${slot.replace(':', '')}-stop-${rsIdx}`,
              stopNumber: rs.order || rsIdx + 1,
              stopName: rs.name,
              address: rs.address,
              lat: rs.lat || 19.1287852,
              lng: rs.lng || 72.8294183,
              timeSlot: slot,
              contactPerson: rs.contactPerson || 'Point of Contact',
              phone: rs.phone || '',
              status: 'pending',
              routeId: route.id,
              routeName: route.name,
              clientId: route.clientId,
              clientName: client.name,
              stopIndex: rsIdx,
              order: rs.order || rsIdx + 1
            });
          });
        }
      });
    });

    // 2. Include standalone / ad-hoc tasks directly assigned to this rider (e.g. laptop pickups, on-demand dispatch)
    todayRiderTasks.forEach((task) => {
      if (processedTaskIds.has(task.id)) return;
      processedTaskIds.add(task.id);

      const client = StorageService.getClientById(task.clientId || task.clientLabId) || {
        name: task.clientName || task.clientLabName || 'Pickup Location'
      };

      const taskStops = (task.stopsProgress && task.stopsProgress.length > 0)
        ? task.stopsProgress
        : (task.stops && task.stops.length > 0 ? task.stops : []);

      if (taskStops.length > 0) {
        taskStops.forEach((sp: any, spIdx: number) => {
          const isCollected = sp.status === 'picked_up' || sp.status === 'completed';
          const isInTransit =
            (task.status === 'started' || task.status === 'at_stop' || task.status === 'in_transit') &&
            !isCollected;
          const status: 'pending' | 'in_transit' | 'collected' = isCollected
            ? 'collected'
            : isInTransit
            ? 'in_transit'
            : 'pending';

          items.push({
            id: `${task.id}-stop-${spIdx}`,
            uniqueKey: `${task.id}-stop-${spIdx}`,
            stopNumber: spIdx + 1,
            stopName: sp.stopName || sp.name || task.clientName || 'Assigned Pickup Point',
            address: sp.address || (task as any).clientAddress || task.destination?.address || 'Pickup Address',
            lat: sp.lat || 19.1287852,
            lng: sp.lng || 72.8294183,
            timeSlot: task.timeSlot || 'Immediate Dispatch',
            contactPerson: sp.contactPerson || 'Point of Contact',
            phone: sp.phone || '',
            status,
            vialCount: sp.sampleCount ?? sp.specimenCount ?? 0,
            coldBoxTemp: sp.coldBoxTemp,
            photoUrl: sp.photoUrl,
            photo2Url: (sp as any).handoverPhotoUrl || (sp as any).photo2Url,
            taskId: task.id,
            task: task,
            routeId: task.routeId || `adhoc-${task.id}`,
            routeName: task.routeName || 'Direct Dispatch Pickup',
            clientId: task.clientId || task.clientLabId || '',
            clientName: task.clientName || client.name,
            stopIndex: spIdx,
            order: spIdx + 1
          });
        });
      } else {
        // Single stop task
        const isCollected = task.status === 'picked_up' || task.status === 'delivered' || task.status === 'completed';
        const isInTransit = (task.status === 'started' || task.status === 'at_stop' || task.status === 'in_transit') && !isCollected;
        const status: 'pending' | 'in_transit' | 'collected' = isCollected ? 'collected' : isInTransit ? 'in_transit' : 'pending';

        items.push({
          id: `${task.id}-stop-0`,
          uniqueKey: `${task.id}-stop-0`,
          stopNumber: 1,
          stopName: task.clientName || task.clientLabName || 'Assigned Pickup Point',
          address: (task as any).clientAddress || task.destination?.address || 'Pickup Address',
          lat: task.clientLabLocation?.lat || 19.1287852,
          lng: task.clientLabLocation?.lng || 72.8294183,
          timeSlot: task.timeSlot || 'Immediate Dispatch',
          contactPerson: 'Point of Contact',
          phone: '',
          status,
          vialCount: 0,
          taskId: task.id,
          task: task,
          routeId: task.routeId || `adhoc-${task.id}`,
          routeName: task.routeName || 'Direct Dispatch Pickup',
          clientId: task.clientId || task.clientLabId || '',
          clientName: task.clientName || client.name,
          stopIndex: 0,
          order: 1
        });
      }
    });

    return items;
  }, [assignedRoutes, todayRiderTasks]);

  // Find currently active task strictly from this rider's tasks
  const activeTask = useMemo(() => {
    // 1. Explicitly selected task if not delivered
    const allKnownTasks = [...liveTasks, ...todayRiderTasks, ...tasks, ...StorageService.getTasks()];
    if (activeTaskId) {
      const explicit = allKnownTasks.find((t) => t.id === activeTaskId);
      if (explicit && explicit.status !== 'delivered' && (explicit.destination as any)?.status !== 'delivered') {
        return explicit;
      }
      if (explicit) return explicit;
    }
    // 2. Any active in-progress task (started, at_stop, picked_up, in_transit)
    const inProgress = todayRiderTasks.find((t) =>
      ['started', 'at_stop', 'picked_up', 'in_transit'].includes(t.status)
    );
    if (inProgress) return inProgress;

    // 3. First non-delivered pending task chronologically
    const nextPending = todayRiderTasks.find(
      (t) => t.status !== 'delivered' && t.status !== 'completed' && (t.destination as any)?.status !== 'delivered'
    );
    if (nextPending) return nextPending;

    // 4. Fallback to first task if all are delivered
    return todayRiderTasks[0] || null;
  }, [todayRiderTasks, activeTaskId, liveTasks, tasks]);

  const activeRoute = useMemo(() => {
    if (!activeTask) return assignedRoutes[0] || null;
    return assignedRoutes.find((r) => r.id === activeTask.routeId) || assignedRoutes[0] || null;
  }, [assignedRoutes, activeTask]);

  const [gpsStatus, setGpsStatus] = useState<GpsStatusEvent>(LocationService.getStatus());

  // Listen to GPS status events (permissions, errors, mode)
  useEffect(() => {
    const unsub = LocationService.subscribeStatus((status) => {
      setGpsStatus(status);
    });
    return () => unsub();
  }, []);

  // Start real GPS broadcasting strictly for active rider ID using LocationService with smart throttling
  useEffect(() => {
    if (isCheckedIn && sessionRiderId) {
      LocationService.startRealGeolocation(sessionRiderId, activeRider.name, activeTask?.id);
    } else {
      LocationService.stop();
    }
    return () => {
      LocationService.stop();
    };
  }, [isCheckedIn, sessionRiderId, activeRider.name, activeTask?.id]);

  // Handle Attendance Toggle & Confirmation
  const handleToggleAttendance = () => {
    if (!isCheckedIn) {
      // Opening duty: open vehicle selection & punch-in setup modal
      setShowVehicleDutyModal(true);
    } else {
      // Currently On Duty: confirm before exiting / ending shift
      setShowExitConfirmModal(true);
    }
  };

  const handleConfirmExit = async () => {
    setShowExitConfirmModal(false);
    setIsCheckedIn(false);
    LocationService.stop();

    try {
      await setDoc(
        doc(db, 'riders', sessionRiderId),
        {
          id: sessionRiderId,
          isCheckedIn: false,
          status: 'off_duty',
          isOnline: false,
          lastUpdated: serverTimestamp()
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Firestore update off_duty error:', e);
    }

    StorageService.clearPortalSession('rider');
    StorageService.updateRider({
      ...activeRider,
      isCheckedIn: false
    });

    onRefresh();
    navigate('/rider/login', { replace: true });
  };

  const handleSaveVehicleAndDuty = async (newType: string, newPlate: string, startShift: boolean) => {
    const cleanPlate = (newPlate || selectedVehicleNumber || '').toUpperCase().trim();
    const cleanType = newType || selectedVehicleType || 'Motorcycle / Bike';

    setSelectedVehicleType(cleanType);
    setSelectedVehicleNumber(cleanPlate);

    const nextChecked = startShift ? true : isCheckedIn;
    setIsCheckedIn(nextChecked);

    const updatedRider: PickupBoy = {
      ...activeRider,
      vehicleType: cleanType,
      vehicleNumber: cleanPlate,
      plateNumber: cleanPlate,
      isCheckedIn: nextChecked
    };

    StorageService.updateRider(updatedRider);

    try {
      await setDoc(
        doc(db, 'riders', sessionRiderId),
        {
          id: sessionRiderId,
          name: activeRider.name,
          phone: activeRider.phone,
          vehicleNo: cleanPlate,
          vehicleNumber: cleanPlate,
          vehicleType: cleanType,
          isCheckedIn: nextChecked,
          status: nextChecked ? 'active' : 'off_duty',
          isOnline: nextChecked,
          lastUpdated: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('[RiderDashboard] Firestore sync vehicle error:', err);
    }

    if (startShift) {
      const nowIso = new Date().toISOString();
      const firstSlotInfo = getRiderFirstRouteSlot(activeRider, assignedRoutes, todayRiderTasks);
      const slotStr = firstSlotInfo?.slot || '10:00 AM - 12:00 PM';
      const slotMinutes = parseSlotToMinutes(slotStr);
      const punchInDate = new Date(nowIso);
      const punchInMinutes = punchInDate.getHours() * 60 + punchInDate.getMinutes();
      const diffMinutes = slotMinutes - punchInMinutes;

      let punctuality: 'early' | 'on_time' | 'late' = 'on_time';
      if (diffMinutes >= 10) punctuality = 'early';
      else if (diffMinutes < -5) punctuality = 'late';

      try {
        await setDoc(
          doc(db, 'riders', sessionRiderId),
          {
            todayPunchInTime: nowIso,
            firstScheduledRouteTime: slotStr,
            punchInPunctuality: punctuality,
            punchInDiffMinutes: diffMinutes,
            isCheckedIn: true,
            status: 'active',
            isOnline: true,
            lastUpdated: serverTimestamp()
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Error updating rider punctuality:', e);
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          StorageService.addAttendanceRecord({
            id: `att-${Date.now()}`,
            riderId: activeRider.id,
            riderName: activeRider.name,
            date: todayStr,
            checkInTime: nowIso,
            checkInLocation: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              address: 'Kandivali Dispatch Hub, Mumbai'
            },
            status: 'on_duty',
            firstRouteSlot: slotStr,
            punchInPunctuality: punctuality,
            punchInDiffMinutes: diffMinutes
          });
          onRefresh();
        },
        () => {
          StorageService.addAttendanceRecord({
            id: `att-${Date.now()}`,
            riderId: activeRider.id,
            riderName: activeRider.name,
            date: todayStr,
            checkInTime: nowIso,
            checkInLocation: {
              lat: 19.2082,
              lng: 72.8398,
              address: 'Kandivali Dispatch Hub, Mumbai'
            },
            status: 'on_duty',
            firstRouteSlot: slotStr,
            punchInPunctuality: punctuality,
            punchInDiffMinutes: diffMinutes
          });
          onRefresh();
        }
      );
    }

    setShowVehicleDutyModal(false);
    onRefresh();
  };

  // Start Route
  const handleStartRoute = (task: PickupTask) => {
    const updated: PickupTask = {
      ...task,
      status: 'started',
      startedAt: new Date().toISOString()
    };
    StorageService.updateTask(updated);
    setActiveTaskId(task.id);
    CloudSync.startTripRoute(task.id, sessionRiderId);
    onRefresh();

    NotificationService.sendAlert({
      type: 'pickup',
      title: `Rider En Route: ${task.timeSlot} Loop`,
      message: `${activeRider.name} has started collection round for ${task.clientName}.`,
      recipientRole: 'both',
      channel: 'both'
    });
  };

  // Handle Photo Upload with 2-Photo Proof & Watermarking
  // Process uploaded/captured photo file with watermark & fallbacks
  const processSelectedFile = async (file: File, photoType: 'photo1' | 'photo2' | 'drop') => {
    if (!file) return;
    setWatermarking(true);

    const safeStops = activeTask?.stopsProgress || (activeTask as any)?.stops || [];
    const currentStop = safeStops[currentStopIndex] || safeStops[0];
    const stopLat = currentStop?.lat || (currentStop as any)?.latitude || 19.2082;
    const stopLng = currentStop?.lng || (currentStop as any)?.longitude || 72.8398;
    const stopAddr =
      photoType === 'drop'
        ? activeTask?.destination?.name || activeTask?.destination?.address || 'Processing Facility'
        : currentStop?.stopName || currentStop?.address || 'Collection Stop';

    try {
      // High-definition watermark with dynamic sizing & zero overlap
      const watermarked = await addWatermarkToImage(file, {
        timestamp: new Date().toISOString(),
        lat: stopLat,
        lng: stopLng,
        address: stopAddr,
        riderName: activeRider.name,
        clientName: activeTask?.clientName || (activeTask as any)?.destination?.name || '',
        vialCount: vialCount,
        temperature: coldBoxTemp,
        isDrop: photoType === 'drop',
        isSelfie: photoType === 'photo2',
        receiverName: photoType === 'drop' ? receiverName : undefined
      });

      if (photoType === 'photo1') setStopPhoto(watermarked);
      else if (photoType === 'photo2') setStopPhoto2(watermarked);
      else setStopPhoto(watermarked);
    } catch (err) {
      console.warn('Watermark generation warning, using compressed fallback:', err);
      try {
        const fallbackBase64 = await compressImageToBase64(file, 1080, 0.80);
        if (photoType === 'photo1') setStopPhoto(fallbackBase64);
        else if (photoType === 'photo2') setStopPhoto2(fallbackBase64);
        else setStopPhoto(fallbackBase64);
      } catch (fallbackErr) {
        console.error('Photo compression fallback error, using FileReader direct:', fallbackErr);
        const reader = new FileReader();
        reader.onload = (re) => {
          const directBase64 = re.target?.result as string;
          if (directBase64) {
            if (photoType === 'photo1') setStopPhoto(directBase64);
            else if (photoType === 'photo2') setStopPhoto2(directBase64);
            else setStopPhoto(directBase64);
          }
        };
        reader.readAsDataURL(file);
      }
    } finally {
      setWatermarking(false);
    }
  };

  // Handle Photo Upload with 2-Photo Proof & Watermarking from input change
  const handlePhotoCapture = async (
    e: React.ChangeEvent<HTMLInputElement>,
    photoType: 'photo1' | 'photo2' | 'drop'
  ) => {
    const file = e.target.files?.[0];
    if (e.target) {
      e.target.value = '';
    }
    if (!file) return;
    await processSelectedFile(file, photoType);
  };

  // Start collection / upload 2-photo proof directly from schedule stop card
  const handleStartStopCollectionFromSchedule = (stopItem: ScheduleStopItem) => {
    const findExistingTask = () => {
      if (stopItem.task) return stopItem.task;
      const allKnown = [...todayRiderTasks, ...liveTasks, ...tasks, ...StorageService.getTasks()];
      return allKnown.find(
        (t) =>
          t &&
          (t.routeId === stopItem.routeId || t.routeName === stopItem.routeName) &&
          (t.timeSlot === stopItem.timeSlot || !t.timeSlot) &&
          (t.date === todayStr || t.scheduledDate === todayStr || ['started', 'at_stop', 'picked_up', 'in_transit', 'assigned'].includes(t.status))
      );
    };

    let targetTask = findExistingTask();

    if (!targetTask) {
      // Find or build task for this assigned route and timing slot
      const matchingRoute = liveRoutes.find((r) => r.id === stopItem.routeId || r.name === stopItem.routeName) ||
        routes.find((r) => r.id === stopItem.routeId || r.name === stopItem.routeName) ||
        liveRoutes[0] ||
        routes[0];

      const cleanRouteId = (matchingRoute?.id || stopItem.routeId || 'route').replace(/[^a-zA-Z0-9_-]/g, '');
      const cleanSlot = (stopItem.timeSlot || '0900').replace(/[^a-zA-Z0-9]/g, '');
      const canonicalTaskId = `task-${todayStr}-${cleanRouteId}-${cleanSlot}`;

      const rawRouteStops = (matchingRoute?.stops && matchingRoute.stops.length > 0)
        ? matchingRoute.stops
        : [];

      const stopsProgress: StopProgress[] = rawRouteStops.map((s: any, idx: number) => ({
        stopId: s.id || `stop-${idx + 1}`,
        id: s.id || `stop-${idx + 1}`,
        stopName: s.name || s.stopName || '',
        name: s.name || s.stopName || '',
        address: s.address || '',
        lat: s.lat || 19.1287852,
        lng: s.lng || 72.8294183,
        contactPerson: s.contactPerson || '',
        phone: s.phone || '',
        status: 'pending',
        sampleCount: 0,
        specimenCount: 0
      }));

      const client = StorageService.getClientById(matchingRoute?.clientId || '') || {
        id: matchingRoute?.clientId || '',
        name: matchingRoute?.destinationLab?.name || (matchingRoute as any)?.clientName || '',
        address: matchingRoute?.destinationLab?.address || ''
      };

      targetTask = {
        id: canonicalTaskId,
        date: todayStr,
        scheduledDate: todayStr,
        timeSlot: stopItem.timeSlot || '',
        routeId: matchingRoute?.id || stopItem.routeId || '',
        routeName: matchingRoute?.name || stopItem.routeName || '',
        clientId: client.id,
        clientName: client.name,
        riderId: activeRider.id,
        riderName: activeRider.name,
        riderPhone: activeRider.phone,
        riderVehicle: activeRider.vehicleNumber,
        status: 'started',
        currentStopIndex: stopItem.stopIndex || 0,
        pickupLocation: {
          name: rawRouteStops[0]?.name || client.name || '',
          address: rawRouteStops[0]?.address || client.address || '',
          lat: rawRouteStops[0]?.lat || 19.1363,
          lng: rawRouteStops[0]?.lng || 72.8277,
          area: ''
        },
        deliveryLocation: {
          name: matchingRoute?.destinationLab?.name || client.name || '',
          address: matchingRoute?.destinationLab?.address || client.address || '',
          lat: matchingRoute?.destinationLab?.lat || 19.1860,
          lng: matchingRoute?.destinationLab?.lng || 72.8485,
          area: ''
        },
        stopsProgress,
        stops: stopsProgress.map((sp: any) => ({
          id: sp.id || sp.stopId,
          stopId: sp.stopId || sp.id,
          name: sp.stopName,
          stopName: sp.stopName,
          address: sp.address,
          lat: sp.lat,
          lng: sp.lng,
          status: sp.status,
          sampleCount: sp.sampleCount || 0,
          specimenCount: sp.sampleCount || 0,
          contactPerson: sp.contactPerson || '',
          phone: sp.phone || ''
        })),
        destination: {
          name: matchingRoute?.destinationLab?.name || client.name || '',
          address: matchingRoute?.destinationLab?.address || client.address || '',
          lat: matchingRoute?.destinationLab?.lat || 19.1860,
          lng: matchingRoute?.destinationLab?.lng || 72.8485,
          receiverName: matchingRoute?.destinationLab?.contactPerson || '',
          notes: ''
        },
        isDelayed: false,
        delayMinutes: 0,
        issueFlags: [],
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString()
      };

      StorageService.addTask(targetTask);
    } else if (targetTask.status === 'upcoming' || targetTask.status === 'pending') {
      targetTask = {
        ...targetTask,
        status: 'started',
        startedAt: targetTask.startedAt || new Date().toISOString()
      };
      StorageService.updateTask(targetTask);
    }

    setActiveTaskId(targetTask.id);
    const stopIdx = stopItem.stopIndex !== undefined ? stopItem.stopIndex : 0;
    setCurrentStopIndex(stopIdx);

    setLiveTasks((prev) => {
      const exists = prev.some((t) => t.id === targetTask!.id);
      if (exists) {
        return prev.map((t) => (t.id === targetTask!.id ? targetTask! : t));
      }
      return [targetTask!, ...prev];
    });

    const safeStops = targetTask.stopsProgress || targetTask.stops || [];
    const targetStop = safeStops[stopIdx] || safeStops[0];
    const rawVials = (targetStop as any)?.sampleCount ?? (targetStop as any)?.specimenCount ?? 0;
    const existingRemark = (targetStop as any)?.remark || ((targetStop as any)?.status === 'no_sample' || (targetStop as any)?.noSampleReason ? 'No Sample' : (rawVials > 0 ? 'Collected sample' : 'Collected sample'));

    if (existingRemark === 'No Sample' || (targetStop as any)?.status === 'no_sample') {
      setPickupRemarkType('No Sample');
      setPickupCustomRemark('');
      setVialCount(0);
    } else if (typeof existingRemark === 'string' && existingRemark.startsWith('Other')) {
      setPickupRemarkType('Other');
      setPickupCustomRemark(existingRemark.replace(/^Other:?\s*/i, ''));
      setVialCount(rawVials);
    } else {
      setPickupRemarkType('Collected sample');
      setPickupCustomRemark('');
      setVialCount(rawVials > 0 ? rawVials : 1);
    }

    setColdBoxTemp((targetStop as any)?.coldBoxTemp ?? 4.0);
    setStopPhoto((targetStop as any)?.photoUrl || null);
    setStopPhoto2((targetStop as any)?.handoverPhotoUrl || (targetStop as any)?.photo2Url || (targetStop as any)?.selfieUrl || null);
    setPickupFormError(null);
    setIsProcessingStop(true);
    onRefresh();
  };

  // Start Lab Drop / Handover from Daily Rounds Schedule
  const handleStartDropFromSchedule = (task: PickupTask | undefined, route: Route, slot: string) => {
    const findExistingTask = () => {
      if (task) return task;
      const allKnown = [...todayRiderTasks, ...liveTasks, ...tasks, ...StorageService.getTasks()];
      return allKnown.find(
        (t) =>
          t &&
          (t.routeId === route?.id || t.routeName === route?.name) &&
          (t.timeSlot === slot || !t.timeSlot) &&
          (t.date === todayStr || t.scheduledDate === todayStr || ['started', 'at_stop', 'picked_up', 'in_transit', 'assigned', 'delivered', 'completed'].includes(t.status))
      );
    };

    let targetTask = findExistingTask();

    if (!targetTask) {
      const cleanRouteId = (route?.id || 'route').replace(/[^a-zA-Z0-9_-]/g, '');
      const cleanSlot = (slot || '0900').replace(/[^a-zA-Z0-9]/g, '');
      const canonicalTaskId = `task-${todayStr}-${cleanRouteId}-${cleanSlot}`;

      const client = StorageService.getClientById(route?.clientId || '') || {
        id: route?.clientId || '',
        name: route?.destinationLab?.name || (route as any)?.clientName || '',
        address: route?.destinationLab?.address || ''
      };

      const rawRouteStops = (route?.stops && route.stops.length > 0)
        ? route.stops
        : [];

      const stopsProgress: StopProgress[] = rawRouteStops.map((s: any, idx: number) => ({
        stopId: s.id || `stop-${idx + 1}`,
        id: s.id || `stop-${idx + 1}`,
        stopName: s.name || s.stopName || '',
        name: s.name || s.stopName || '',
        address: s.address || '',
        lat: s.lat || 19.1287852,
        lng: s.lng || 72.8294183,
        contactPerson: s.contactPerson || '',
        phone: s.phone || '',
        status: 'picked_up',
        sampleCount: s.sampleCount || 0,
        specimenCount: s.sampleCount || 0
      }));

      targetTask = {
        id: canonicalTaskId,
        date: todayStr,
        scheduledDate: todayStr,
        timeSlot: slot,
        routeId: route?.id || '',
        routeName: route?.name || '',
        clientId: client.id,
        clientName: client.name,
        riderId: activeRider.id,
        riderName: activeRider.name,
        riderPhone: activeRider.phone,
        riderVehicle: activeRider.vehicleNumber,
        status: 'in_transit',
        currentStopIndex: stopsProgress.length,
        pickupLocation: {
          name: rawRouteStops[0]?.name || client.name || '',
          address: rawRouteStops[0]?.address || client.address || '',
          lat: rawRouteStops[0]?.lat || 19.1363,
          lng: rawRouteStops[0]?.lng || 72.8277,
          area: ''
        },
        deliveryLocation: {
          name: route?.destinationLab?.name || client.name || '',
          address: route?.destinationLab?.address || client.address || '',
          lat: route?.destinationLab?.lat || 19.1860,
          lng: route?.destinationLab?.lng || 72.8485,
          area: ''
        },
        stopsProgress,
        stops: stopsProgress.map((sp: any) => ({
          id: sp.id || sp.stopId,
          stopId: sp.stopId || sp.id,
          name: sp.stopName,
          stopName: sp.stopName,
          address: sp.address,
          lat: sp.lat,
          lng: sp.lng,
          status: sp.status,
          sampleCount: sp.sampleCount || 0,
          specimenCount: sp.sampleCount || 0,
          contactPerson: sp.contactPerson,
          phone: sp.phone
        })),
        destination: {
          name: route?.destinationLab?.name || client.name,
          address: route?.destinationLab?.address || client.address,
          lat: route?.destinationLab?.lat || 19.1860,
          lng: route?.destinationLab?.lng || 72.8485,
          receiverName: route?.destinationLab?.contactPerson || 'Jayesh joshi',
          notes: 'Specimen cold-chain transport'
        },
        isDelayed: false,
        delayMinutes: 0,
        issueFlags: [],
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString()
      };

      StorageService.addTask(targetTask);
    }

    setActiveTaskId(targetTask.id);
    setReceiverName(
      route?.destinationLab?.contactPerson ||
      (targetTask.destination as any)?.receiverName ||
      targetTask.receiverName ||
      'Jayesh joshi'
    );
    setColdBoxTemp(targetTask.destination?.coldBoxTempAtDrop ?? 4.0);
    setStopPhoto(targetTask.destination?.dropPhotoUrl || (targetTask as any).handoverPhotoUrl || null);
    setStopPhoto2(null);
    setDropFormError(null);
    setIsProcessingDrop(true);
    onRefresh();
  };

  // Confirm Stop Pickup with 2-Photo Proof (Specimens & Selfie) & Remark
  const handleConfirmStopPickup = () => {
    const allKnownTasks = [...liveTasks, ...todayRiderTasks, ...tasks, ...StorageService.getTasks()];
    const currentTask = (activeTaskId ? allKnownTasks.find((t) => t.id === activeTaskId) : null) || activeTask;

    if (!currentTask) {
      console.warn("No active task to update in handleConfirmStopPickup");
      return;
    }

    // Determine final remark and vial count based on rider selection
    const finalRemark =
      pickupRemarkType === 'Collected sample'
        ? 'Collected sample'
        : pickupRemarkType === 'No Sample'
        ? 'No Sample'
        : pickupCustomRemark.trim()
        ? `Other: ${pickupCustomRemark.trim()}`
        : 'Other';

    const finalVialCount = pickupRemarkType === 'No Sample' ? 0 : Math.max(0, vialCount);

    // Proof Validations based on selected remark
    if (pickupRemarkType === 'Collected sample') {
      if (finalVialCount <= 0) {
        setPickupFormError('Please enter at least 1 vial for "Collected sample", or choose "No Sample" if zero specimens were available.');
        return;
      }
      if (!stopPhoto && !stopPhoto2) {
        setPickupFormError('Mandatory Proofs Required: Please capture/upload both "Specimen Vials in Chiller Rack" AND "Rider Location Selfie" before confirming.');
        return;
      }
      if (!stopPhoto) {
        setPickupFormError('Mandatory Photo 1 Missing: Please capture/upload photo of "Specimen Vials in Chiller Rack".');
        return;
      }
      if (!stopPhoto2) {
        setPickupFormError('Mandatory Photo 2 Missing: Please capture/upload "Rider Location Selfie" to verify on-site presence.');
        return;
      }
    } else if (pickupRemarkType === 'No Sample') {
      if (!stopPhoto2 && !stopPhoto) {
        setPickupFormError('Mandatory Arrival Proof: Please capture/upload "Rider Location Selfie" to verify on-site presence for No Sample.');
        return;
      }
    } else {
      // Other
      if (!stopPhoto2 && !stopPhoto) {
        setPickupFormError('Mandatory Proof Required: Please capture/upload "Rider Location Selfie" or verification photo.');
        return;
      }
    }

    setPickupFormError(null);

    const rawStops = (currentTask.stopsProgress && currentTask.stopsProgress.length > 0)
      ? currentTask.stopsProgress
      : (currentTask.stops && currentTask.stops.length > 0 ? currentTask.stops : []);

    const safeStops: any[] = rawStops.length > 0 ? [...rawStops] : [{
      id: 'stop-1',
      stopId: 'stop-1',
      stopName: currentTask.clientName || 'Assigned Pickup Point',
      name: currentTask.clientName || 'Assigned Pickup Point',
      address: currentTask.pickupLocation?.address || currentTask.destination?.address || 'Mumbai Pickup Point',
      lat: currentTask.pickupLocation?.lat || 19.1287852,
      lng: currentTask.pickupLocation?.lng || 72.8294183,
      status: 'pending',
      sampleCount: finalVialCount
    }];

    const targetIdx = Math.max(0, Math.min(currentStopIndex, safeStops.length - 1));
    const stopToUpdate = safeStops[targetIdx] || safeStops[0] || { stopName: 'Collection Point' };
    const stopName = stopToUpdate.stopName || stopToUpdate.name || 'Collection Stop';

    const finalSamplePhoto = stopPhoto;
    const finalSelfiePhoto = stopPhoto2 || stopPhoto;

    const stopStatus: StopStatus = pickupRemarkType === 'No Sample' ? 'no_sample' : 'picked_up';

    const stopNotes =
      pickupRemarkType === 'No Sample'
        ? 'No Sample - Verified at collection point (0 samples ready).'
        : pickupRemarkType === 'Collected sample'
        ? `${finalVialCount} specimen vials collected and sealed in chiller rack.`
        : `Other: ${pickupCustomRemark.trim() || 'Special condition noted'} (${finalVialCount} vials)`;

    const updatedStops: StopProgress[] = safeStops.map((s, idx) => {
      if (idx === targetIdx) {
        return {
          ...s,
          status: stopStatus,
          pickedUpAt: new Date().toISOString(),
          arrivedAt: s.arrivedAt || new Date().toISOString(),
          sampleCount: finalVialCount,
          specimenCount: finalVialCount,
          coldBoxTemp: coldBoxTemp,
          photoUrl: finalSamplePhoto || undefined,
          handoverPhotoUrl: finalSelfiePhoto || undefined,
          photo2Url: finalSelfiePhoto || undefined,
          selfieUrl: finalSelfiePhoto || undefined,
          photoTimestamp: new Date().toISOString(),
          photoLocation: { lat: s.lat || 19.2082, lng: s.lng || 72.8398, accuracy: 5 },
          notes: stopNotes,
          remark: finalRemark,
          noSampleReason: pickupRemarkType === 'No Sample' ? 'No Sample ready at collection point' : undefined
        };
      }
      return s;
    });

    const isAllStopsPicked = updatedStops.every((s) => s.status === 'picked_up' || s.status === 'no_sample' || s.status === 'completed');

    const updatedTask: PickupTask = {
      ...currentTask,
      status: isAllStopsPicked ? 'in_transit' : 'at_stop',
      stopsProgress: updatedStops,
      stops: updatedStops.map((sp: any) => ({
        id: sp.id || sp.stopId,
        stopId: sp.stopId || sp.id,
        name: sp.stopName || sp.name,
        stopName: sp.stopName || sp.name,
        address: sp.address,
        lat: sp.lat,
        lng: sp.lng,
        status: sp.status,
        sampleCount: sp.sampleCount ?? sp.specimenCount ?? 0,
        specimenCount: sp.sampleCount ?? sp.specimenCount ?? 0,
        photoUrl: sp.photoUrl || '',
        photo2Url: sp.photo2Url || sp.handoverPhotoUrl || sp.selfieUrl || '',
        handoverPhotoUrl: sp.handoverPhotoUrl || sp.photo2Url || sp.selfieUrl || '',
        selfieUrl: sp.selfieUrl || sp.photo2Url || sp.handoverPhotoUrl || '',
        coldBoxTemp: sp.coldBoxTemp,
        arrivedAt: sp.arrivedAt,
        pickedUpAt: sp.pickedUpAt,
        completedAt: sp.completedAt,
        photoTimestamp: sp.photoTimestamp,
        photoLocation: sp.photoLocation,
        notes: sp.notes || '',
        remark: sp.remark,
        noSampleReason: sp.noSampleReason
      })),
      photoUrl: finalSamplePhoto || currentTask.photoUrl,
      photo2Url: finalSelfiePhoto || currentTask.photo2Url,
      selfieUrl: finalSelfiePhoto || currentTask.selfieUrl,
      handoverPhotoUrl: finalSelfiePhoto || currentTask.handoverPhotoUrl,
      coldBoxTemp: coldBoxTemp,
      sampleCount: updatedStops.reduce((sum, st) => sum + (st.sampleCount || 0), 0)
    };

    setLiveTasks((prev) => {
      const exists = prev.some((t) => t.id === updatedTask.id);
      if (exists) {
        return prev.map((t) => (t.id === updatedTask.id ? updatedTask : t));
      }
      return [updatedTask, ...prev];
    });
    StorageService.updateTask(updatedTask);
    CloudSync.completeTripStop(
      currentTask.id,
      targetIdx,
      updatedStops,
      {
        sampleCount: finalVialCount,
        coldBoxTemp: coldBoxTemp,
        photoUrl: finalSamplePhoto || '',
        handoverPhotoUrl: finalSelfiePhoto || '',
        photo2Url: finalSelfiePhoto || '',
        selfieUrl: finalSelfiePhoto || '',
        notes: stopNotes,
        remark: finalRemark,
        status: stopStatus,
        noSampleReason: pickupRemarkType === 'No Sample' ? 'No Sample ready at collection point' : undefined
      }
    );
    setIsProcessingStop(false);
    setStopPhoto(null);
    setStopPhoto2(null);
    setVialCount(1);
    setPickupRemarkType('Collected sample');
    setPickupCustomRemark('');
    onRefresh();

    const notifTitle =
      pickupRemarkType === 'No Sample'
        ? `No Sample Recorded at ${stopName}`
        : pickupRemarkType === 'Collected sample'
        ? `Sample Picked: ${finalVialCount} Vials`
        : `Stop Remark Logged: ${finalRemark}`;

    NotificationService.sendAlert({
      type: 'pickup',
      title: notifTitle,
      message: `${activeRider.name} updated ${stopName}: [${finalRemark}] ${finalVialCount > 0 ? `${finalVialCount} vials collected.` : ''} Cold box: ${coldBoxTemp}°C.`,
      recipientRole: 'both',
      channel: 'both'
    });
  };

  // Complete Destination Lab Delivery
  const handleConfirmLabDelivery = () => {
    if (!activeTask) return;

    if (!stopPhoto) {
      setDropFormError('Mandatory Proof Missing: Please capture/upload or generate the Lab Handover Proof photo before completing delivery.');
      return;
    }
    if (!receiverName || !receiverName.trim()) {
      setDropFormError('Mandatory Field Missing: Please enter the Receiver Name / Pathologist in Lab.');
      return;
    }

    setDropFormError(null);

    const finalLabPhoto = stopPhoto;

    const safeStops = activeTask.stopsProgress || activeTask.stops || [];
    const totalVials = safeStops.reduce((sum: number, s: any) => sum + Number(s?.sampleCount || s?.specimenCount || 0), 0);

    const nowStr = new Date().toISOString();
    const updatedTask: PickupTask = {
      ...activeTask,
      status: 'delivered',
      completedAt: nowStr,
      deliveryTimestamp: nowStr,
      isHandedOver: true,
      isCompleted: true,
      receiverName: receiverName,
      intakeReceiver: receiverName,
      handoverPhotoUrl: finalLabPhoto,
      handoverTemperature: coldBoxTemp,
      destination: {
        ...activeTask.destination,
        name: activeTask.destination?.name || 'Central Diagnostic Processing Lab',
        address: activeTask.destination?.address || 'Lab Facility',
        status: 'delivered',
        deliveredAt: nowStr,
        receiverName: receiverName,
        dropPhotoUrl: finalLabPhoto,
        handoverPhotoUrl: finalLabPhoto,
        coldBoxTempAtDrop: coldBoxTemp,
        totalVialsHandedOver: totalVials,
        notes: `Total ${totalVials} specimen vials handed over in certified cold chain (${coldBoxTemp}°C).`
      }
    };

    setLiveTasks((prev) => (prev || []).map((t) => (t.id === updatedTask.id ? updatedTask : t)));
    StorageService.updateTask(updatedTask);
    CloudSync.completeTripFinalHandover(activeTask.id, sessionRiderId, {
      destinationName: activeTask.destination?.name || 'Central Diagnostic Processing Lab',
      destinationAddress: activeTask.destination?.address || 'Lab Facility',
      receiverName,
      totalVials,
      coldBoxTemp,
      dropPhotoUrl: finalLabPhoto
    });
    setIsProcessingDrop(false);
    setStopPhoto(null);
    setStopPhoto2(null);
    onRefresh();

    NotificationService.sendAlert({
      type: 'delivery',
      title: `Lab Delivery Completed (${totalVials} Vials)`,
      message: `${activeRider.name} delivered ${totalVials} vials to ${activeTask.destination?.name || 'Central Lab'}. Received by ${receiverName}.`,
      recipientRole: 'both',
      channel: 'both'
    });
  };

  // Report Delay
  const handleReportDelay = () => {
    if (!activeTask) return;
    const newFlag: any = {
      id: `issue-${Date.now()}`,
      type: 'delay',
      reason: delayReason,
      description: `Rider reported delay: ${delayReason}`,
      reportedAt: new Date().toISOString(),
      reportedByRiderId: activeRider.id,
      reportedByRiderName: activeRider.name,
      resolved: false
    };
    const updated: PickupTask = {
      ...activeTask,
      isDelayed: true,
      delayMinutes: (activeTask.delayMinutes || 0) + 20,
      issueFlags: [...(activeTask.issueFlags || []), newFlag]
    };
    StorageService.updateTask(updated);
    setShowDelayModal(false);
    onRefresh();

    NotificationService.sendAlert({
      type: 'delay',
      title: `Rider Delay Alert: +20 Mins`,
      message: `${activeRider.name} reported delay: ${delayReason} on ${activeTask.timeSlot} loop.`,
      recipientRole: 'both',
      channel: 'both'
    });
  };

  // Trigger: Start Route / En Route to Next Stop with real-time Firestore sync
  const handleStartRouteOrEnRoute = async (targetStopIdx?: number) => {
    if (!activeTask) return;

    const stopIdx = targetStopIdx !== undefined ? targetStopIdx : currentStopIndex;
    const targetStop = activeTask.stopsProgress[stopIdx] || activeTask.stopsProgress[0];
    const destinationStopName = targetStop?.stopName || activeTask.destination.name;
    const riderId = sessionRiderId || activeRider.id || 'rider';
    const riderName = sessionName || activeRider.name || 'Assigned Phlebotomist';

    // 1. Update local task state and storage
    const updatedTask: PickupTask = {
      ...activeTask,
      status: 'in_transit',
      riderId: riderId,
      riderName: riderName,
      activeRiderId: riderId,
      activeRiderName: riderName,
      currentDestinationStop: destinationStopName,
      tripStartedAt: new Date().toISOString(),
      startedAt: activeTask.startedAt || new Date().toISOString(),
      currentStopIndex: stopIdx
    } as any;

    StorageService.updateTask(updatedTask);
    setCurrentStopIndex(stopIdx);

    // 2. Update task in Firestore with in_transit status, rider info, destination stop & timestamp
    try {
      await setDoc(
        doc(db, 'tasks', activeTask.id),
        {
          status: 'in_transit',
          activeRiderId: riderId,
          activeRiderName: riderName,
          riderId: riderId,
          riderName: riderName,
          currentDestinationStop: destinationStopName,
          tripStartedAt: serverTimestamp(),
          startedAt: activeTask.startedAt || new Date().toISOString(),
          lastUpdated: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Error updating Firestore task status to in_transit:', err);
    }

    // 3. Update rider document in Firestore with current active task and destination
    try {
      await setDoc(
        doc(db, 'riders', riderId),
        {
          id: riderId,
          name: riderName,
          currentTaskId: activeTask.id,
          currentDestinationStop: destinationStopName,
          tripStartedAt: serverTimestamp(),
          status: 'active',
          isOnline: true,
          lastUpdated: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Error updating Firestore rider current destination:', err);
    }

    // 4. Send operational notification alert
    NotificationService.sendAlert({
      type: 'task_started',
      title: `Rider En Route: ${riderName}`,
      message: `${riderName} has started trip and is en route to ${destinationStopName}. Client tracking is live.`,
      recipientRole: 'both',
      channel: 'both'
    });

    onRefresh();
  };

  // Calculate live summary counters
  const totalCollectedVials = useMemo(() => {
    return (todayRiderTasks || []).reduce((sum: number, t: any) => {
      const stops = t?.stopsProgress || t?.stops || [];
      const taskVials = stops.reduce((sub: number, s: any) => sub + Number(s?.sampleCount || s?.specimenCount || 0), 0);
      return sum + taskVials;
    }, 0);
  }, [todayRiderTasks]);

  const completedStopsCount = useMemo(() => {
    return (scheduleStops || []).filter((s) => s?.status === 'collected').length;
  }, [scheduleStops]);

  // Evaluate current punctuality & route countdown
  const punctualityReport = useMemo(() => {
    return evaluateRiderPunctuality(activeRider, assignedRoutes, undefined, todayRiderTasks);
  }, [activeRider, assignedRoutes, todayRiderTasks]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-16">
      {/* Punch In Duty & Route Time Alert Banner (When Not Checked In) */}
      {!isCheckedIn && punctualityReport.status !== 'no_route' && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
            punctualityReport.isOverdue
              ? 'bg-red-50 border-red-300 text-red-900'
              : 'bg-amber-50 border-amber-300 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                punctualityReport.isOverdue ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
              }`}
            >
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">
                  {punctualityReport.isOverdue ? '🚨 URGENT: Punch-In Overdue!' : '⏰ Punch-In Required Before Route Starts'}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${punctualityReport.badgeClass}`}>
                  {punctualityReport.label}
                </span>
              </div>
              <p className="text-xs mt-1 opacity-90">
                Route: <span className="font-semibold">{punctualityReport.routeName}</span> • Slot:{' '}
                <span className="font-semibold">{punctualityReport.firstSlot}</span>.
                You must punch in with vehicle details and live GPS broadcast before initiating stop collections.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowVehicleDutyModal(true)}
            className={`px-4 py-2.5 rounded-lg font-bold text-xs text-white shadow-xs shrink-0 cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-2 ${
              punctualityReport.isOverdue ? 'bg-red-700 hover:bg-red-800' : 'bg-amber-700 hover:bg-amber-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>PUNCH IN & START DUTY</span>
          </button>
        </div>
      )}

      {/* GPS Status Banner */}
      {gpsStatus.errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-800 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <div>
              <span className="font-bold">GPS Access Warning:</span> {gpsStatus.errorMessage}
            </div>
          </div>
          <button
            onClick={() => LocationService.startRealGeolocation(activeRider.id, activeRider.name, activeTask?.id)}
            className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white rounded-md font-bold text-xs shrink-0 cursor-pointer"
          >
            Grant Location
          </button>
        </div>
      )}

      {/* Rider Header Bar & Live Duty Status */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={activeRider.photoUrl}
              alt={activeRider.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-sky-600 shadow-xs"
            />
            <span
              className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                isCheckedIn ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 text-base sm:text-lg">{activeRider.name}</h2>
              <span className="text-[11px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                {selectedVehicleNumber}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <button
                type="button"
                onClick={() => setShowVehicleDutyModal(true)}
                className="text-xs text-slate-700 hover:text-sky-800 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 cursor-pointer transition-colors"
                title="Change Vehicle Type / Number"
              >
                <Bike className="w-3.5 h-3.5 text-sky-700" />
                <span className="font-semibold">{selectedVehicleType}</span>
                <Edit2 className="w-3 h-3 text-slate-400" />
              </button>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-medium text-slate-600">{activeRider.shiftTimings || '08:00 AM - 04:00 PM'}</span>
            </div>
          </div>
        </div>

        {/* Action / Attendance Toggle */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-600" /> : <WifiOff className="w-3.5 h-3.5 text-red-600" />}
            <span>{isOnline ? 'Cloud Synced' : 'Offline Mode'}</span>
          </div>

          <button
            type="button"
            onClick={handleToggleAttendance}
            className={`px-4 py-2 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer active:scale-95 ${
              isCheckedIn
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                : 'bg-slate-800 hover:bg-slate-900 text-white'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>{isCheckedIn ? 'ON DUTY (LIVE GPS)' : 'PUNCH IN (START SHIFT)'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Quick Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Loops / Pickups</span>
          <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
            {assignedRoutes.length + (todayRiderTasks.filter(t => !assignedRoutes.some(r => r.id === t.routeId)).length)}
          </span>
          <span className="text-[10px] text-slate-500 truncate block mt-0.5">
            {[
              ...assignedRoutes.map((r) => r.name),
              ...todayRiderTasks.filter(t => !assignedRoutes.some(r => r.id === t.routeId)).map(t => t.routeName || t.clientName)
            ].filter(Boolean).join(', ') || 'No Assigned Pickups'}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Stops Progress</span>
          <span className="text-xl font-bold font-mono text-sky-800 mt-1 block">
            {completedStopsCount} / {scheduleStops.length}
          </span>
          <span className="text-[10px] text-sky-700 font-semibold block mt-0.5">
            {scheduleStops.length > 0 ? `${Math.round((completedStopsCount / scheduleStops.length) * 100)}% Completed` : '0%'}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Collected Vials</span>
          <span className="text-xl font-bold font-mono text-emerald-800 mt-1 block">{totalCollectedVials}</span>
          <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">2°C – 8°C Cold Chain Certified</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">GPS Status</span>
          <span className="text-xl font-bold font-mono text-emerald-700 mt-1 block flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
            <span>Active</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
            High Precision Live GPS
          </span>
        </div>
      </div>

      {/* No Assigned Routes or Tasks Empty State */}
      {assignedRoutes.length === 0 && todayRiderTasks.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center mx-auto border border-sky-200">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No Collection Loops or Pickups Assigned</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            You currently have no diagnostic routes or pickup tasks assigned to your shift. Please contact SecondMedic Ops Dispatch to assign your schedule.
          </p>
          <a
            href={`tel:${opsHotline.replace(/\D/g, '')}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Call Ops Dispatch Desk ({opsHotline})</span>
          </a>
        </div>
      )}

      {/* Active Loop Command Hero Card */}
      {activeTask && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md font-mono font-bold text-xs bg-sky-700 text-white">
                {activeTask.timeSlot} LOOP
              </span>
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">{activeTask.routeName}</h3>
                <p className="text-xs text-slate-500">{activeTask.clientName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleStartRouteOrEnRoute()}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer"
              >
                <Bike className="w-3.5 h-3.5" />
                <span>{activeTask.status === 'in_transit' ? 'En Route (Live)' : 'Start Route'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDelayModal(true)}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Report Delay</span>
              </button>

              <button
                type="button"
                onClick={() => setShowLiveMap(!showLiveMap)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Navigation className="w-3.5 h-3.5 text-sky-700" />
                <span>{showLiveMap ? 'Hide Map' : 'Show Map'}</span>
              </button>
            </div>
          </div>

          {/* Optional Live Route Map */}
          {showLiveMap && (
            <div className="rounded-xl overflow-hidden border border-slate-200 shadow-2xs">
              <LiveMap
                tasks={activeTask ? [activeTask] : []}
                riders={[activeRider]}
                rider={activeRider}
                stops={activeRoute?.stops || activeTask?.stopsProgress || []}
                destination={activeRoute?.destinationLab || activeTask?.destination}
                height="280px"
                activeTaskId={activeTask.id}
                enableFirestoreSync={true}
              />
            </div>
          )}

          {/* Active Loop Stops Stepper with Sequential Stop Revelation */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Active Round Stops Checklist
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                Sequential Verification Protocol
              </span>
            </div>
            <div className="space-y-2">
              {(() => {
                const safeStops = activeTask.stopsProgress || activeTask.stops || [];
                const firstPendingIdx = safeStops.findIndex((s) => s.status !== 'picked_up');

                return safeStops.map((stop, idx) => {
                  const isPicked = stop.status === 'picked_up';
                  const isLocked = !isPicked && firstPendingIdx !== -1 && idx > firstPendingIdx;
                  const isUnlockedActive = !isPicked && (idx === firstPendingIdx || (firstPendingIdx === -1 && idx === 0));
                  const isCurrent = (currentStopIndex === idx || isUnlockedActive) && !isPicked && !isLocked;
                  const cleanPhone = (stop.phone || '').replace(/\D/g, '');

                  return (
                    <div
                      key={stop.stopId}
                      className={`p-3 sm:p-4 rounded-xl border transition-all ${
                        isPicked
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : isUnlockedActive
                          ? 'bg-sky-50/60 border-sky-300 ring-2 ring-sky-400/40 shadow-xs'
                          : isLocked
                          ? 'bg-slate-50/70 border-slate-200 opacity-80'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                              isPicked
                                ? 'bg-emerald-700 text-white'
                                : isUnlockedActive
                                ? 'bg-sky-700 text-white animate-pulse'
                                : isLocked
                                ? 'bg-slate-200 text-slate-500'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isPicked ? (
                              <Check className="w-4 h-4" />
                            ) : isLocked ? (
                              <Lock className="w-3.5 h-3.5" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className={`font-bold text-xs sm:text-sm ${isLocked ? 'text-slate-600' : 'text-slate-900'}`}>
                                {stop.stopName}
                              </h4>
                              {isUnlockedActive && (
                                <span className="px-2 py-0.2 bg-sky-100 text-sky-800 text-[10px] font-bold rounded-full border border-sky-300 animate-pulse">
                                  ACTIVE STOP
                                </span>
                              )}
                              {isLocked && (
                                <span className="px-1.5 py-0.2 bg-slate-100 text-slate-500 text-[9px] font-bold rounded border border-slate-200 flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Locked
                                </span>
                              )}
                            </div>

                            {isLocked ? (
                              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                <span>🔒 Details locked until Stop {firstPendingIdx + 1} ({activeTask.stopsProgress[firstPendingIdx]?.stopName}) is completed</span>
                              </p>
                            ) : (
                              <>
                                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{stop.address}</span>
                                </p>
                                <p className="text-[11px] text-slate-500 mt-1">
                                  Contact: <span className="font-medium text-slate-800">{stop.contactPerson}</span> ({stop.phone})
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isLocked ? (
                            <span className="px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-200">
                              <Lock className="w-3.5 h-3.5" />
                              <span>Locked</span>
                            </span>
                          ) : (
                            <>
                              {stop.phone && (
                                <a
                                  href={`tel:${cleanPhone}`}
                                  className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs"
                                  title="Call contact"
                                >
                                  <PhoneCall className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Call</span>
                                </a>
                              )}

                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs"
                                title="Navigate via Maps"
                              >
                                <Navigation className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Navigate</span>
                              </a>

                              {!isPicked && (
                                <button
                                  type="button"
                                  onClick={() => handleStartRouteOrEnRoute(idx)}
                                  className="p-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                                  title="Mark En Route to this stop"
                                >
                                  <Bike className="w-3.5 h-3.5 text-sky-700" />
                                  <span className="hidden sm:inline">En Route</span>
                                </button>
                              )}

                              {!isPicked ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (activeTask?.id) setActiveTaskId(activeTask.id);
                                    setCurrentStopIndex(idx);
                                    setVialCount(stop.sampleCount || 0);
                                    setColdBoxTemp(stop.coldBoxTemp || 4.0);
                                    setStopPhoto(stop.photoUrl || null);
                                    setStopPhoto2((stop as any).handoverPhotoUrl || (stop as any).photo2Url || (stop as any).selfieUrl || null);
                                    setIsProcessingStop(true);
                                  }}
                                  className="px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-98"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  <span>Capture 2-Photo Proof</span>
                                </button>
                              ) : (
                                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-md border border-emerald-200 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>{stop.sampleCount ?? 0} Vials Collected</span>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Destination Central Lab Handover Section */}
          <div className="p-3.5 sm:p-4 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                  Final Processing Destination
                </span>
                <h4 className="font-bold text-slate-900 text-sm">{activeTask.destination.name}</h4>
                <p className="text-xs text-slate-600 mt-0.5">{activeTask.destination.address}</p>
              </div>

              {activeTask.destination.status !== 'delivered' ? (
                <button
                  type="button"
                  onClick={() => setIsProcessingDrop(true)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Handover to Lab</span>
                </button>
              ) : (
                <span className="px-3 py-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs rounded-lg flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>Handover Verified ({activeTask.destination.receiverName})</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "My Daily Rounds Schedule" Displaying Assigned Stops */}
      <DailyRoundsSchedule
        scheduleStops={scheduleStops}
        assignedRoutes={assignedRoutes}
        activeTaskId={activeTask?.id}
        onStartCollection={handleStartStopCollectionFromSchedule}
        onOpenProofModal={onOpenProof}
        onSelectTask={(taskId) => setActiveTaskId(taskId)}
        onStartDrop={handleStartDropFromSchedule}
      />

      {/* Modal: Process Stop Pickup (2-Photo Proof: Specimen Vials + Signed Slip) */}
      {isProcessingStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto animate-fadeIn">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-5 shadow-2xl space-y-4 my-6">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <Camera className="w-4 h-4 text-sky-700" />
                  <span>Upload 2-Photo Proof & Confirm Pickup</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {activeTask?.stopsProgress[currentStopIndex]?.stopName}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsProcessingStop(false);
                  setPickupFormError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Notification Alert */}
            {pickupFormError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{pickupFormError}</span>
              </div>
            )}

            {/* Rider Remark Selector */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Pickup Status Remark (Visible to Client)
                </label>
                <span className="text-[10px] text-sky-700 font-bold bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                  {pickupRemarkType}
                </span>
              </div>

              {/* 3 Main Remark Options */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPickupRemarkType('Collected sample');
                    if (vialCount === 0) setVialCount(1);
                  }}
                  className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    pickupRemarkType === 'Collected sample'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-200 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className={`w-4 h-4 ${pickupRemarkType === 'Collected sample' ? 'text-emerald-700' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold leading-tight">Collected sample</span>
                  <span className="text-[9px] text-slate-500 font-medium">Vials collected</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPickupRemarkType('No Sample');
                    setVialCount(0);
                  }}
                  className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    pickupRemarkType === 'No Sample'
                      ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-200 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <AlertCircle className={`w-4 h-4 ${pickupRemarkType === 'No Sample' ? 'text-amber-700' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold leading-tight">No Sample</span>
                  <span className="text-[9px] text-slate-500 font-medium">Zero samples</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPickupRemarkType('Other');
                  }}
                  className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    pickupRemarkType === 'Other'
                      ? 'bg-sky-50 border-sky-400 text-sky-900 ring-2 ring-sky-200 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <FileText className={`w-4 h-4 ${pickupRemarkType === 'Other' ? 'text-sky-700' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold leading-tight">Other</span>
                  <span className="text-[9px] text-slate-500 font-medium">Custom status</span>
                </button>
              </div>

              {/* Sub-details for 'Other' option */}
              {pickupRemarkType === 'Other' && (
                <div className="pt-2 border-t border-slate-200 space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700">Specify Remark / Reason:</span>
                    <span className="text-slate-400 text-[10px]">Client will see this</span>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Clinic closed, Doctor unavailable, Sample postponed..."
                    value={pickupCustomRemark}
                    onChange={(e) => setPickupCustomRemark(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-1 focus:ring-sky-600 focus:border-sky-600 font-medium"
                  />
                  {/* Quick Pill presets */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {['Center Closed', 'Doctor Unavailable', 'Postponed to Next Round', 'Compromised Specimen'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPickupCustomRemark(preset)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                          pickupCustomRemark === preset
                            ? 'bg-sky-700 text-white border-sky-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Informative notification for No Sample */}
              {pickupRemarkType === 'No Sample' && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    <strong>"No Sample"</strong> remark will be reported to the client. Zero vials will be recorded, and rider location selfie will verify your on-site visit.
                  </span>
                </div>
              )}
            </div>

            {/* Quick 1-Handed Manual Vial Counter Stepper (Active for Collected sample and Other) */}
            {pickupRemarkType !== 'No Sample' ? (
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Manual Vial Count (Entered by Rider)
                  </label>
                  <span className="text-[11px] text-emerald-800 font-bold">Vials: {vialCount}</span>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setVialCount(Math.max(1, vialCount - 1))}
                    className="w-11 h-11 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-2xl flex items-center justify-center active:scale-90 shadow-xs cursor-pointer"
                    title="Decrease count"
                  >
                    <Minus className="w-5 h-5" />
                  </button>

                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={vialCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setVialCount(isNaN(val) || val < 0 ? 0 : val);
                      }}
                      className="w-24 h-11 text-center font-mono font-bold text-2xl text-emerald-800 bg-white border-2 border-emerald-300 rounded-lg focus:outline-hidden focus:border-emerald-600 shadow-inner"
                    />
                    <span className="block text-[9px] text-slate-400 uppercase font-semibold mt-0.5">Vials Picked</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setVialCount(vialCount + 1)}
                    className="w-11 h-11 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-2xl flex items-center justify-center active:scale-90 shadow-xs cursor-pointer"
                    title="Increase count"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Quick Preset Selector Chips */}
                <div className="flex items-center justify-center gap-1.5 pt-1 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">Quick:</span>
                  {[1, 2, 5, 10, 15, 20].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setVialCount(preset)}
                      className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md border transition-all cursor-pointer ${
                        vialCount === preset
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Specimens Count:</span>
                <span className="font-mono font-bold text-xs bg-amber-100 text-amber-900 px-3 py-1 rounded-md border border-amber-300">
                  0 Vials (No Sample)
                </span>
              </div>
            )}

            {/* Chiller Box Temperature reading */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-sky-700" /> Cold-Box Temp (°C)
                </span>
                <span className="font-mono font-bold text-emerald-800 text-xs">{coldBoxTemp}°C</span>
              </div>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={coldBoxTemp}
                onChange={(e) => setColdBoxTemp(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-700"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>0°C</span>
                <span className="text-emerald-700 font-bold">2°C – 8°C (Certified Safe Range)</span>
                <span>12°C</span>
              </div>
            </div>

            {/* 2-Photo Proof Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Mandatory 2-Photo Proof (Specimens & Selfie) <span className="text-rose-600 font-bold">*</span>
                </label>
              </div>

              {/* Watermarking Progress Alert */}
              {watermarking && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 flex items-center gap-2 text-sky-900 text-xs font-medium animate-pulse">
                  <Loader2 className="w-4 h-4 text-sky-600 animate-spin shrink-0" />
                  <span>Processing & Geotagging ISO-15189 Watermarked Chain of Custody Proof...</span>
                </div>
              )}

              {/* Photo 1: Specimen Vials in Rack */}
              <div 
                className={`border rounded-lg p-3 space-y-2 transition-all ${
                  !stopPhoto && pickupFormError && pickupRemarkType === 'Collected sample'
                    ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-300'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) processSelectedFile(droppedFile, 'photo1');
                }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-sky-700" />
                    <span>Photo 1: Specimen Vials in Chiller Rack</span>
                    <span className="text-rose-600 font-bold">*</span>
                  </span>
                  {stopPhoto ? (
                    <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Geotagged
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-700 font-bold bg-rose-100/90 px-1.5 py-0.5 rounded border border-rose-200">
                      * Required Photo
                    </span>
                  )}
                </div>

                <input
                  ref={fileInputRef1}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handlePhotoCapture(e, 'photo1')}
                />
                <input
                  ref={fileGalleryRef1}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoCapture(e, 'photo1')}
                />

                {stopPhoto ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 group">
                    <img src={stopPhoto} alt="Specimen Vials Proof" className="w-full h-32 object-cover" />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
                      <span className="text-[10px] text-white font-mono truncate max-w-[200px]">
                        Vials Geotagged
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef1.current?.click()}
                          className="px-2 py-0.5 bg-white/90 hover:bg-white text-slate-900 rounded text-[11px] font-semibold cursor-pointer"
                        >
                          Retake
                        </button>
                        <button
                          type="button"
                          onClick={() => setStopPhoto(null)}
                          className="p-1 bg-red-600/90 hover:bg-red-600 text-white rounded text-[11px] cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef1.current?.click()}
                      disabled={watermarking}
                      className="py-3 px-1.5 border-2 border-dashed border-sky-400 rounded-lg bg-sky-50/70 hover:bg-sky-100 text-sky-900 font-bold text-xs flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
                      title="Open Live Camera"
                    >
                      <Camera className="w-4 h-4 text-sky-700" />
                      <span className="text-[11px]">{watermarking ? '...' : 'Camera'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileGalleryRef1.current?.click()}
                      disabled={watermarking}
                      className="py-3 px-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
                      title="Select from Photo Library / Files or Drag & Drop"
                    >
                      <Upload className="w-4 h-4 text-slate-600" />
                      <span className="text-[11px]">Upload</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Photo 2: Rider Location Selfie */}
              <div 
                className={`border rounded-lg p-3 space-y-2 transition-all ${
                  !stopPhoto2 && pickupFormError
                    ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-300'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) processSelectedFile(droppedFile, 'photo2');
                }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-sky-700" />
                    <span>Photo 2: Rider Location Selfie</span>
                    <span className="text-rose-600 font-bold">*</span>
                  </span>
                  {stopPhoto2 ? (
                    <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Geotagged
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-700 font-bold bg-rose-100/90 px-1.5 py-0.5 rounded border border-rose-200">
                      * Required Selfie
                    </span>
                  )}
                </div>

                <input
                  ref={fileInputRef2}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => handlePhotoCapture(e, 'photo2')}
                />
                <input
                  ref={fileGalleryRef2}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoCapture(e, 'photo2')}
                />

                {stopPhoto2 ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 group">
                    <img src={stopPhoto2} alt="Rider Location Selfie Proof" className="w-full h-32 object-cover" />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
                      <span className="text-[10px] text-white font-mono truncate max-w-[200px]">
                        Selfie Geotagged
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef2.current?.click()}
                          className="px-2 py-0.5 bg-white/90 hover:bg-white text-slate-900 rounded text-[11px] font-semibold cursor-pointer"
                        >
                          Retake
                        </button>
                        <button
                          type="button"
                          onClick={() => setStopPhoto2(null)}
                          className="p-1 bg-red-600/90 hover:bg-red-600 text-white rounded text-[11px] cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef2.current?.click()}
                      disabled={watermarking}
                      className="py-3 px-1.5 border-2 border-dashed border-sky-400 rounded-lg bg-sky-50/70 hover:bg-sky-100 text-sky-900 font-bold text-xs flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
                      title="Open Front Camera Selfie"
                    >
                      <Camera className="w-4 h-4 text-sky-700" />
                      <span className="text-[11px]">{watermarking ? '...' : 'Selfie'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileGalleryRef2.current?.click()}
                      disabled={watermarking}
                      className="py-3 px-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
                      title="Select Selfie from Photo Library / Files or Drag & Drop"
                    >
                      <Upload className="w-4 h-4 text-slate-600" />
                      <span className="text-[11px]">Upload</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleConfirmStopPickup}
                disabled={watermarking}
                className="w-full py-2.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <Check className="w-4 h-4" />
                <span>CONFIRM 2-PHOTO PICKUP ({vialCount} VIALS & SELFIE)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Process Final Lab Delivery Handover */}
      {isProcessingDrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 shadow-2xl space-y-4 my-6">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>Diagnostic Lab Handover Confirmation</span>
              </h3>
              <button
                onClick={() => {
                  setIsProcessingDrop(false);
                  setDropFormError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Notification Alert */}
            {dropFormError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{dropFormError}</span>
              </div>
            )}

            {/* Watermarking Progress Alert */}
            {watermarking && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2 text-emerald-900 text-xs font-medium animate-pulse">
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />
                <span>Processing & Geotagging Diagnostic Lab Handover Proof...</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Receiver Name / Pathologist in Lab
              </label>
              <input
                type="text"
                required
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium text-xs focus:outline-hidden focus:border-sky-600"
              />
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-emerald-700" /> Handover Temperature (°C)
                </span>
                <span className="font-mono font-bold text-emerald-800 text-xs">{coldBoxTemp}°C</span>
              </div>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={coldBoxTemp}
                onChange={(e) => setColdBoxTemp(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-700"
              />
            </div>

            {/* Handover Photo */}
            <div 
              className={`space-y-2 p-3 rounded-lg border transition-all ${
                !stopPhoto && dropFormError
                  ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-300'
                  : 'border-slate-200 bg-slate-50/30'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile) processSelectedFile(droppedFile, 'drop');
              }}
            >
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <span>Lab Handover Photo / Signed Slip</span>
                  <span className="text-rose-600 font-bold">*</span>
                </label>
                {stopPhoto ? (
                  <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Geotagged
                  </span>
                ) : (
                  <span className="text-[10px] text-rose-700 font-bold bg-rose-100/90 px-1.5 py-0.5 rounded border border-rose-200">
                    * Required Photo
                  </span>
                )}
              </div>

              <input
                ref={dropFileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handlePhotoCapture(e, 'drop')}
              />
              <input
                ref={dropGalleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePhotoCapture(e, 'drop')}
              />

              {stopPhoto ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 group">
                  <img src={stopPhoto} alt="Lab Handover Proof" className="w-full h-44 object-cover" />
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
                    <span className="text-[10px] text-white font-mono truncate max-w-[200px]">
                      GPS & Lab Handover Tagged
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => dropFileInputRef.current?.click()}
                        className="px-2.5 py-1 bg-white/90 hover:bg-white text-slate-900 rounded text-xs font-semibold shadow-xs cursor-pointer"
                      >
                        Retake
                      </button>
                      <button
                        type="button"
                        onClick={() => setStopPhoto(null)}
                        className="p-1 bg-red-600/90 hover:bg-red-600 text-white rounded text-xs cursor-pointer"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => dropFileInputRef.current?.click()}
                    disabled={watermarking}
                    className="py-3 px-2 border-2 border-dashed border-emerald-400 rounded-lg bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 font-bold text-xs flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
                    title="Take photo with camera"
                  >
                    <Camera className="w-4 h-4 text-emerald-700" />
                    <span className="text-[11px]">{watermarking ? '...' : 'Camera'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => dropGalleryRef.current?.click()}
                    disabled={watermarking}
                    className="py-3 px-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
                    title="Choose from photo library / signed slip file or drag & drop"
                  >
                    <Upload className="w-4 h-4 text-slate-600" />
                    <span className="text-[11px]">Upload Slip</span>
                  </button>
                </div>
              )}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleConfirmLabDelivery}
                disabled={watermarking}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {!stopPhoto
                    ? 'COMPLETE LAB DELIVERY (Photo Required)'
                    : 'COMPLETE LAB DELIVERY'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delay Report Modal */}
      {showDelayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Report Delay to Ops & Client</span>
              </h3>
              <button onClick={() => setShowDelayModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Select Delay Reason (1-Tap)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'Heavy Traffic / Rain',
                  'Bike Breakdown',
                  'Hospital Lab Busy / Packaging',
                  'Chiller Ice Pack Replacement',
                  'Route Diverted'
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setDelayReason(reason)}
                    className={`p-2 rounded-lg text-xs font-semibold text-left transition-colors border shadow-xs cursor-pointer ${
                      delayReason === reason
                        ? 'bg-amber-50 text-amber-900 border-amber-400'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleReportDelay}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                DISPATCH DELAY ALERT (+20 MINS)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Type Selection & Duty Start Modal */}
      {showVehicleDutyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-50 text-sky-700 rounded-lg">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {isCheckedIn ? 'Update Vehicle Profile' : 'Start Shift & Select Vehicle'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isCheckedIn ? 'Change your assigned 2-wheeler' : 'Select vehicle type to begin live tracking'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowVehicleDutyModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Vehicle Type Selection */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                Select Vehicle Type *
              </label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { type: 'Motorcycle / Bike', desc: 'Hero Splendor, Bajaj Pulsar, Honda Shine (Cold-Box Mounted)' },
                  { type: 'Scooter / Scooty', desc: 'Honda Activa, Suzuki Access, TVS Jupiter (Front/Rear Carrier)' },
                  { type: 'Electric EV 2-Wheeler', desc: 'Ola S1, Ather 450, TVS iQube, Bajaj Chetak (Zero Emission)' }
                ].map((item) => {
                  const isSelected = selectedVehicleType === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setSelectedVehicleType(item.type)}
                      className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'border-sky-600 bg-sky-50/70 ring-1 ring-sky-600 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isSelected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <Bike className="w-4 h-4" />
                        </div>
                        <div>
                          <span className={`text-xs font-bold block ${isSelected ? 'text-sky-950' : 'text-slate-800'}`}>
                            {item.type}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5 block">{item.desc}</span>
                        </div>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-sky-700 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vehicle Registration Plate */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Vehicle Plate Number
              </label>
              <input
                type="text"
                value={selectedVehicleNumber}
                onChange={(e) => setSelectedVehicleNumber(e.target.value.toUpperCase())}
                placeholder="e.g. MH-02-AB-1234"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono font-bold text-sm tracking-wider uppercase focus:outline-hidden focus:border-sky-600 focus:bg-white"
              />
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowVehicleDutyModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveVehicleAndDuty(selectedVehicleType, selectedVehicleNumber, !isCheckedIn)}
                className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <UserCheck className="w-4 h-4" />
                <span>{isCheckedIn ? 'SAVE VEHICLE' : 'CONFIRM & PUNCH IN'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back Button / Exit Shift Confirmation Modal */}
      {showExitConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="p-2.5 bg-amber-50 text-amber-700 rounded-full shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">You are currently On Duty</h3>
                <p className="text-xs text-slate-500">Live GPS tracking and collection rounds are active</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Are you sure you want to end your shift and exit the rider portal? Your live GPS beacon will be paused and your status will be set to Off Duty.
            </p>

            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>STAY ON DUTY</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmExit}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 font-bold text-xs sm:text-sm rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>END SHIFT & EXIT</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
