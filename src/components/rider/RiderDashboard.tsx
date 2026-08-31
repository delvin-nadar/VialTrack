import React, { useState, useEffect, useRef } from 'react';
import { UserAuth, PickupTask, Route, PickupBoy, StopProgress, TaskStatus } from '../../types';
import {
  Bike,
  MapPin,
  Clock,
  PhoneCall,
  Navigation,
  Camera,
  CheckCircle2,
  AlertTriangle,
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
  Image as ImageIcon
} from 'lucide-react';
import { addWatermarkToImage, compressImageToBase64, generateSampleVialPhoto } from '../../services/imageWatermark';
import { StorageService } from '../../services/storage';
import { LocationService } from '../../services/locationService';
import { NotificationService } from '../../services/notificationService';
import { LiveMap } from '../common/LiveMap';

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
  const fallbackRider: PickupBoy = {
    id: user?.riderId || 'rider-rahul',
    name: user?.name || 'Rahul Sharma',
    email: user?.email || 'rahul.sharma@vialtrack.in',
    phone: user?.phone || '+91 98765 43210',
    photoUrl: user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80',
    vehicleNumber: 'MH-02-DN-4921',
    vehicleType: 'Hero Splendor Plus',
    assignedRouteIds: [routes[0]?.id || 'route-andheri-west-1'],
    status: 'active',
    joiningDate: '2025-11-10',
    isOnline: true,
    isCheckedIn: true
  };

  const activeRider: PickupBoy = rider || fallbackRider;

  const [isCheckedIn, setIsCheckedIn] = useState<boolean>(activeRider.isCheckedIn ?? true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState<number>(0);
  const [isProcessingStop, setIsProcessingStop] = useState<boolean>(false);
  const [isProcessingDrop, setIsProcessingDrop] = useState<boolean>(false);

  // Sync state if rider changes
  useEffect(() => {
    if (rider?.isCheckedIn !== undefined) {
      setIsCheckedIn(rider.isCheckedIn);
    }
  }, [rider?.isCheckedIn]);

  // Stop collection form state
  const [vialCount, setVialCount] = useState<number>(0);
  const [coldBoxTemp, setColdBoxTemp] = useState<number>(4.0);
  const [stopPhoto, setStopPhoto] = useState<string | null>(null);
  const [receiverName, setReceiverName] = useState<string>('Dr. Ramesh Patil (Lab Head)');
  const [delayReason, setDelayReason] = useState<string>('Heavy Traffic / Rain');
  const [showDelayModal, setShowDelayModal] = useState<boolean>(false);
  const [watermarking, setWatermarking] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [showLiveMap, setShowLiveMap] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropFileInputRef = useRef<HTMLInputElement>(null);

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

  // Filter tasks assigned to this rider
  const riderTasks = tasks.filter((t) => t.riderId === activeRider.id);
  const todayStr = new Date().toISOString().split('T')[0];
  const todayTasks = riderTasks.filter((t) => t.date === todayStr);

  // Find currently active task or default to first in-progress/upcoming
  const activeTask =
    todayTasks.find((t) => t.id === activeTaskId) ||
    todayTasks.find((t) => ['started', 'at_stop', 'picked_up', 'in_transit'].includes(t.status)) ||
    todayTasks[0];

  const activeRoute = routes.find((r) => r.id === activeTask?.routeId) || routes[0];

  // Start GPS broadcasting when on duty
  useEffect(() => {
    if (isCheckedIn) {
      LocationService.startTracking((loc) => {
        // Broadcast location updates
      });
    }
  }, [isCheckedIn]);

  // Handle Attendance Toggle
  const handleToggleAttendance = () => {
    const nextChecked = !isCheckedIn;
    setIsCheckedIn(nextChecked);
    StorageService.updateRider({
      ...activeRider,
      isCheckedIn: nextChecked
    });

    if (nextChecked) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          StorageService.addAttendanceRecord({
            id: `att-${Date.now()}`,
            riderId: activeRider.id,
            riderName: activeRider.name,
            date: todayStr,
            checkInTime: new Date().toISOString(),
            checkInLocation: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              address: 'Kandivali Dispatch Hub, Mumbai'
            },
            status: 'on_duty'
          });
          onRefresh();
        },
        () => {
          StorageService.addAttendanceRecord({
            id: `att-${Date.now()}`,
            riderId: activeRider.id,
            riderName: activeRider.name,
            date: todayStr,
            checkInTime: new Date().toISOString(),
            checkInLocation: {
              lat: 19.2082,
              lng: 72.8398,
              address: 'Kandivali Dispatch Hub, Mumbai'
            },
            status: 'on_duty'
          });
          onRefresh();
        }
      );
    }
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
    onRefresh();

    NotificationService.sendAlert({
      type: 'pickup',
      title: `Rider En Route: ${task.timeSlot} Loop`,
      message: `${activeRider.name} has started collection round for ${task.clientName}.`,
      recipientRole: 'both',
      channel: 'both'
    });
  };

  // Handle Photo Upload with Watermarking
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>, isDrop = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setWatermarking(true);
    const currentStop = activeTask?.stopsProgress[currentStopIndex];

    // Reset file input value so repeated captures trigger onChange
    if (e.target) {
      e.target.value = '';
    }

    try {
      // Step 1: Compress via HTML5 Canvas to max 800px JPEG (0.6 quality)
      const compressedBase64 = await compressImageToBase64(file, 800, 0.6);

      // Step 2: Apply GPS & cold-chain watermark overlay
      const watermarked = await addWatermarkToImage(
        compressedBase64,
        {
          timestamp: new Date().toISOString(),
          lat: 19.2082,
          lng: 72.8398,
          address: isDrop ? activeTask?.destination.name || 'Diagnostic Lab' : currentStop?.stopName || 'Hospital Stop',
          riderName: activeRider.name,
          clientName: activeTask?.clientName || 'Diagnostic Partner',
          vialCount: vialCount,
          temperature: coldBoxTemp,
          isDrop: isDrop,
          receiverName: isDrop ? receiverName : undefined
        }
      );

      setStopPhoto(watermarked);
    } catch (err) {
      console.warn('Watermark generation fallback to compressed photo:', err);
      try {
        const fallbackBase64 = await compressImageToBase64(file, 800, 0.6);
        setStopPhoto(fallbackBase64);
      } catch {
        // Safe fallback
      }
    } finally {
      setWatermarking(false);
    }
  };

  // Instant Sample / Cam Snap Simulator
  const handleInstantPhotoSnap = async (isDrop = false) => {
    setWatermarking(true);
    const currentStop = activeTask?.stopsProgress[currentStopIndex];
    const generated = generateSampleVialPhoto(
      isDrop ? 'drop' : 'vial',
      isDrop
        ? `Diagnostic Lab Handover • ${activeTask?.destination.name}`
        : `${vialCount} Blood Vials • ${currentStop?.stopName || 'Hospital Stop'}`
    );

    try {
      const watermarked = await addWatermarkToImage(generated, {
        timestamp: new Date().toISOString(),
        lat: 19.2082,
        lng: 72.8398,
        address: isDrop ? activeTask?.destination.name || 'Diagnostic Lab' : currentStop?.stopName || 'Hospital Stop',
        riderName: activeRider.name,
        clientName: activeTask?.clientName || 'Diagnostic Partner',
        vialCount: vialCount,
        temperature: coldBoxTemp,
        isDrop: isDrop,
        receiverName: isDrop ? receiverName : undefined
      });
      setStopPhoto(watermarked);
    } catch {
      setStopPhoto(generated);
    } finally {
      setWatermarking(false);
    }
  };

  // Confirm Stop Pickup
  const handleConfirmStopPickup = () => {
    if (!activeTask) return;

    const stopToUpdate = activeTask.stopsProgress[currentStopIndex];
    const finalSamplePhoto =
      stopPhoto ||
      generateSampleVialPhoto(
        'vial',
        `${vialCount} Specimen Vials (${stopToUpdate.stopName})`
      );

    const updatedStops: StopProgress[] = activeTask.stopsProgress.map((s, idx) => {
      if (idx === currentStopIndex) {
        return {
          ...s,
          status: 'picked_up',
          pickedUpAt: new Date().toISOString(),
          arrivedAt: s.arrivedAt || new Date().toISOString(),
          sampleCount: vialCount,
          coldBoxTemp: coldBoxTemp,
          photoUrl: finalSamplePhoto,
          photoTimestamp: new Date().toISOString(),
          photoLocation: { lat: 19.2082, lng: 72.8398, accuracy: 5 },
          notes: vialCount === 0 ? 'Verified: 0 samples ready for collection.' : `${vialCount} specimen vials sealed in chiller rack.`
        };
      }
      return s;
    });

    const isAllStopsPicked = updatedStops.every((s) => s.status === 'picked_up' || s.status === 'no_sample');

    const updatedTask: PickupTask = {
      ...activeTask,
      status: isAllStopsPicked ? 'in_transit' : 'at_stop',
      stopsProgress: updatedStops
    };

    StorageService.updateTask(updatedTask);
    setIsProcessingStop(false);
    setStopPhoto(null);
    setVialCount(0);
    onRefresh();

    NotificationService.sendAlert({
      type: 'pickup',
      title: `Sample Picked: ${vialCount} Vials`,
      message: `${activeRider.name} collected ${vialCount} vials at ${stopToUpdate.stopName}. Cold box: ${coldBoxTemp}°C.`,
      recipientRole: 'both',
      channel: 'both'
    });
  };

  // Complete Destination Lab Delivery
  const handleConfirmLabDelivery = () => {
    if (!activeTask) return;

    const finalLabPhoto =
      stopPhoto ||
      generateSampleVialPhoto(
        'drop',
        `Lab Handover Verified (${activeTask.destination.name})`
      );

    const totalVials = activeTask.stopsProgress.reduce((sum, s) => sum + (s.sampleCount || 0), 0);

    const updatedTask: PickupTask = {
      ...activeTask,
      status: 'delivered',
      completedAt: new Date().toISOString(),
      destination: {
        ...activeTask.destination,
        status: 'delivered',
        deliveredAt: new Date().toISOString(),
        receiverName: receiverName,
        dropPhotoUrl: finalLabPhoto,
        handoverPhotoUrl: finalLabPhoto,
        coldBoxTempAtDrop: coldBoxTemp,
        totalVialsHandedOver: totalVials,
        notes: `Total ${totalVials} specimen vials handed over in certified cold chain (${coldBoxTemp}°C).`
      }
    };

    StorageService.updateTask(updatedTask);
    setIsProcessingDrop(false);
    setStopPhoto(null);
    onRefresh();

    NotificationService.sendAlert({
      type: 'delivered',
      title: `Delivery Confirmed: ${activeTask.timeSlot} Round`,
      message: `Total ${totalVials} specimen vials delivered to ${activeTask.destination.name}. Received by ${receiverName}. Cold-chain safe: ${coldBoxTemp}°C.`,
      recipientRole: 'both',
      channel: 'both'
    });
  };

  // Report Delay
  const handleReportDelay = () => {
    if (!activeTask) return;

    const updatedTask: PickupTask = {
      ...activeTask,
      isDelayed: true,
      delayMinutes: 20,
      issueFlags: [
        ...(activeTask.issueFlags || []),
        {
          id: `issue-${Date.now()}`,
          reportedAt: new Date().toISOString(),
          reason: delayReason,
          resolved: false
        }
      ]
    };

    StorageService.updateTask(updatedTask);
    setShowDelayModal(false);
    onRefresh();

    NotificationService.sendAlert({
      type: 'delay',
      title: `Rider Reported Delay (+20m)`,
      message: `${activeRider.name} on ${activeTask.routeName} reported: ${delayReason}. SecondMedic Ops notified.`,
      recipientRole: 'both',
      channel: 'both'
    });
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-16">
      {/* Rider Status & Duty Header (Mobile Bar) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={activeRider.photoUrl}
              alt={activeRider.name}
              className="w-11 h-11 rounded-lg object-cover border border-slate-200 shadow-xs"
            />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-600 rounded-full border-2 border-white flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-white" />
            </span>
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-base leading-tight">{activeRider.name}</h2>
            <p className="text-xs text-sky-700 font-mono font-medium">{activeRider.vehicleNumber}</p>
          </div>
        </div>

        {/* Check-In Toggle button */}
        <button
          onClick={handleToggleAttendance}
          className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer ${
            isCheckedIn
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300'
          }`}
        >
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <span>{isCheckedIn ? 'On Duty (GPS ON)' : 'Check In'}</span>
        </button>
      </div>

      {/* Connectivity & Cold-Box Status Pill */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between shadow-xs">
          <span className="text-slate-500 flex items-center gap-1.5 text-[11px] font-medium">
            <Thermometer className="w-4 h-4 text-sky-700" /> Cold-Box:
          </span>
          <span className="font-mono font-bold text-emerald-800 text-xs">4.0°C (Safe)</span>
        </div>

        <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between shadow-xs">
          <span className="text-slate-500 flex items-center gap-1.5 text-[11px] font-medium">
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-amber-600" />}
            <span>Sync:</span>
          </span>
          <span className="font-mono font-bold text-slate-700 text-xs">{isOnline ? 'Online (PWA)' : 'Offline Store'}</span>
        </div>
      </div>

      {/* Active Loop Command Hero Card */}
      {activeTask && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-sky-700 text-white font-mono font-bold text-xs px-2 py-0.5 rounded">
                {activeTask.timeSlot}
              </span>
              <div>
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm">{activeTask.clientName}</h3>
                <p className="text-[11px] text-slate-500">{activeTask.routeName}</p>
              </div>
            </div>

            <button
              onClick={() => setShowDelayModal(true)}
              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[11px] rounded-lg border border-amber-300 flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Delay</span>
            </button>
          </div>

          {/* If Task is Upcoming: Big 1-Touch START BUTTON */}
          {activeTask.status === 'upcoming' && (
            <div className="pt-1">
              <button
                onClick={() => handleStartRoute(activeTask)}
                className="w-full py-3.5 bg-sky-700 hover:bg-sky-800 text-white font-bold text-base rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
              >
                <Bike className="w-5 h-5" />
                <span>START {activeTask.timeSlot} COLLECTION LOOP</span>
              </button>
            </div>
          )}

          {/* Stops List & Action Stepper */}
          {activeTask.status !== 'upcoming' && (
            <div className="space-y-3 pt-1">
              {/* Dynamic Live Route Map Card */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-2.5 px-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Navigation className="w-3.5 h-3.5 text-sky-700" />
                    <span>Live GPS Navigation & Polyline Route</span>
                  </div>
                  <button
                    onClick={() => setShowLiveMap(!showLiveMap)}
                    className="text-[11px] font-bold text-sky-700 hover:text-sky-800 cursor-pointer"
                  >
                    {showLiveMap ? 'Hide Map' : 'Show Map'}
                  </button>
                </div>
                {showLiveMap && (
                  <LiveMap
                    stops={activeRoute?.stops || []}
                    destination={activeRoute?.destinationLab}
                    rider={activeRider}
                    tasks={[activeTask]}
                    activeTaskId={activeTask.id}
                    height="280px"
                    autoFit={true}
                    enableFirestoreSync={true}
                  />
                )}
              </div>

              <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                <span>Collection Stops ({activeTask.stopsProgress.length})</span>
                <span className="text-sky-700">
                  {activeTask.stopsProgress.filter((s) => s.status === 'picked_up').length} / {activeTask.stopsProgress.length} Picked
                </span>
              </div>

              <div className="space-y-2">
                {activeTask.stopsProgress.map((stop, sIdx) => {
                  const isPicked = stop.status === 'picked_up';

                  return (
                    <div
                      key={stop.stopId || sIdx}
                      className={`p-3 rounded-lg border transition-all shadow-xs ${
                        isPicked
                          ? 'bg-emerald-50/50 border-emerald-200 text-slate-700'
                          : 'bg-white border-sky-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`w-5 h-5 rounded-full font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5 ${
                              isPicked
                                ? 'bg-emerald-600 text-white'
                                : 'bg-sky-700 text-white'
                            }`}
                          >
                            {isPicked ? <Check className="w-3.5 h-3.5" /> : sIdx + 1}
                          </span>
                          <div>
                            <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{stop.stopName}</h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">{stop.address}</p>
                            <span className="text-[11px] text-sky-700 font-medium block mt-1">
                              Contact: {stop.contactPerson} ({stop.phone})
                            </span>
                          </div>
                        </div>

                        {/* Navigation & Call shortcuts */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={`tel:${stop.phone}`}
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-emerald-800 rounded-md border border-slate-200 transition-colors active:scale-95 shadow-xs"
                            title="Call Hospital Contact"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                              stop.address
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-sky-700 rounded-md border border-slate-200 transition-colors active:scale-95 shadow-xs"
                            title="Open Google Maps Navigation"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* Pickup Confirmation Action */}
                      {!isPicked && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-600" /> Awaiting Pickup
                          </span>
                          <button
                            onClick={() => {
                              const targetStop = activeTask.stopsProgress[sIdx];
                              setCurrentStopIndex(sIdx);
                              setVialCount(targetStop.sampleCount ?? 0);
                              setColdBoxTemp(targetStop.coldBoxTemp ?? 4.0);
                              setStopPhoto(targetStop.photoUrl || null);
                              setIsProcessingStop(true);
                            }}
                            className="px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Collect Samples</span>
                          </button>
                        </div>
                      )}

                      {isPicked && (
                        <div className="mt-2 text-[11px] flex items-center justify-between text-emerald-800 font-mono font-medium">
                          <span>✓ {stop.sampleCount ?? 0} Vials Picked</span>
                          <span>Chiller: {stop.coldBoxTemp}°C</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Destination Lab Handover Card */}
              <div
                className={`p-3.5 rounded-lg border transition-all shadow-xs ${
                  activeTask.status === 'delivered'
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                        Destination Lab: {activeTask.destination.name}
                      </h4>
                      <p className="text-[11px] text-slate-500">{activeTask.destination.address}</p>
                    </div>
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      activeTask.destination.address
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 text-sky-700 rounded-md border border-slate-200 shadow-xs"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </a>
                </div>

                {activeTask.status !== 'delivered' && (
                  <button
                    onClick={() => {
                      setStopPhoto(activeTask.destination.dropPhotoUrl || activeTask.destination.handoverPhotoUrl || null);
                      setColdBoxTemp(activeTask.destination.coldBoxTempAtDrop ?? 4.0);
                      setReceiverName(activeTask.destination.receiverName || 'Dr. Ramesh Patil (Lab Head)');
                      setIsProcessingDrop(true);
                    }}
                    className="w-full mt-2.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>HANDOVER SAMPLES AT DESTINATION LAB</span>
                  </button>
                )}

                {activeTask.status === 'delivered' && (
                  <div className="mt-2 text-xs text-emerald-800 flex items-center justify-between font-bold">
                    <span>✓ Delivered & Verified</span>
                    <button
                      onClick={() => onOpenProof(activeTask)}
                      className="text-sky-700 hover:underline text-xs cursor-pointer font-semibold"
                    >
                      View Handover Proof
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Today's Other Assigned Slots Schedule */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2.5">
        <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-700" />
          <span>My Daily Rounds Schedule</span>
        </h3>

        <div className="space-y-1.5">
          {todayTasks.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveTaskId(t.id)}
              className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all shadow-xs ${
                activeTask?.id === t.id
                  ? 'bg-sky-50 border-sky-300'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs bg-slate-50 px-2 py-0.5 rounded text-slate-900 border border-slate-200">
                  {t.timeSlot}
                </span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">{t.clientName}</div>
                  <div className="text-[10px] text-slate-500">{t.stopsProgress.length} Stops</div>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  t.status === 'delivered'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : t.status === 'in_transit'
                    ? 'bg-sky-100 text-sky-800 border border-sky-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {t.status === 'delivered' ? 'Delivered' : t.status === 'in_transit' ? 'In Progress' : 'Scheduled'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Process Stop Pickup (Watermarked photo + Vial Counter + Temp) */}
      {isProcessingStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 shadow-2xl space-y-4 my-6">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <Camera className="w-4 h-4 text-sky-700" />
                  <span>Confirm Sample Collection</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {activeTask?.stopsProgress[currentStopIndex]?.stopName}
                </p>
              </div>
              <button
                onClick={() => setIsProcessingStop(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick 1-Handed Vial Counter Stepper */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Vials / Blood Samples Count
                </label>
                <span className="text-[11px] text-slate-500 font-medium">Default: 0</span>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setVialCount(Math.max(0, vialCount - 1))}
                  className="w-11 h-11 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-2xl flex items-center justify-center active:scale-90 shadow-xs cursor-pointer"
                  title="Decrease count"
                >
                  <Minus className="w-5 h-5" />
                </button>

                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={vialCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setVialCount(isNaN(val) || val < 0 ? 0 : val);
                    }}
                    className="w-24 h-11 text-center font-mono font-bold text-2xl text-amber-800 bg-white border-2 border-slate-300 rounded-lg focus:outline-hidden focus:border-sky-600 shadow-inner"
                  />
                  <span className="block text-[9px] text-slate-400 uppercase font-semibold mt-0.5">Vials</span>
                </div>

                <button
                  type="button"
                  onClick={() => setVialCount(vialCount + 1)}
                  className="w-11 h-11 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-bold text-2xl flex items-center justify-center active:scale-90 shadow-xs cursor-pointer"
                  title="Increase count"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Preset Selector Chips */}
              <div className="flex items-center justify-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-400 font-semibold mr-1">Quick:</span>
                {[0, 2, 5, 10, 15, 20].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setVialCount(preset)}
                    className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md border transition-all cursor-pointer ${
                      vialCount === preset
                        ? 'bg-sky-700 text-white border-sky-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

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
                <span className="text-emerald-700 font-bold">2°C – 8°C (Safe Range)</span>
                <span>12°C</span>
              </div>
            </div>

            {/* Photo Capture & SecondMedic Watermark */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Photo Proof (Automated GPS Watermark)
                </label>
                {stopPhoto && (
                  <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Geotagged
                  </span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />

              {stopPhoto ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 group">
                  <img src={stopPhoto} alt="Watermarked Proof" className="w-full h-44 object-cover" />
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
                    <span className="text-[10px] text-white font-mono truncate max-w-[200px]">
                      GPS & Time Watermarked
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={watermarking}
                    className="py-4 px-3 border-2 border-dashed border-sky-300 rounded-lg bg-sky-50/50 hover:bg-sky-50 text-sky-800 font-bold text-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
                  >
                    <Camera className="w-5 h-5 text-sky-700" />
                    <span>{watermarking ? 'Processing...' : 'Upload / Camera Shot'}</span>
                    <span className="text-[10px] text-slate-500">Device camera or file</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInstantPhotoSnap(false)}
                    disabled={watermarking}
                    className="py-4 px-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
                  >
                    <Sparkles className="w-5 h-5 text-amber-600" />
                    <span>Instant Cam Snap</span>
                    <span className="text-[10px] text-slate-500">Auto-generated proof</span>
                  </button>
                </div>
              )}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleConfirmStopPickup}
                className="w-full py-2.5 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <Check className="w-4 h-4" />
                <span>CONFIRM PICKUP ({vialCount} VIALS)</span>
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
                onClick={() => setIsProcessingDrop(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Lab Handover Photo / Signed Slip
                </label>
                {stopPhoto && (
                  <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Geotagged
                  </span>
                )}
              </div>

              <input
                ref={dropFileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handlePhotoCapture(e, true)}
              />

              {stopPhoto ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 group">
                  <img src={stopPhoto} alt="Lab Handover Proof" className="w-full h-44 object-cover" />
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
                    <span className="text-[10px] text-white font-mono truncate max-w-[200px]">
                      GPS & Intake Slip Tagged
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => dropFileInputRef.current?.click()}
                    disabled={watermarking}
                    className="py-4 px-3 border-2 border-dashed border-emerald-300 rounded-lg bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 font-bold text-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
                  >
                    <Camera className="w-5 h-5 text-emerald-700" />
                    <span>{watermarking ? 'Processing...' : 'Upload / Snap Slip'}</span>
                    <span className="text-[10px] text-slate-500">Camera / Signed Slip</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInstantPhotoSnap(true)}
                    disabled={watermarking}
                    className="py-4 px-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
                  >
                    <Sparkles className="w-5 h-5 text-emerald-600" />
                    <span>Instant Intake Snap</span>
                    <span className="text-[10px] text-slate-500">Auto-generated slip</span>
                  </button>
                </div>
              )}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleConfirmLabDelivery}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>COMPLETE LAB DELIVERY</span>
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
    </div>
  );
};
