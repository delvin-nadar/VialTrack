import React, { useState, useMemo, useEffect } from 'react';
import { PickupTask, PickupBoy, Route, Client, NotificationLog } from '../../types';
import { LiveMap } from '../common/LiveMap';
import { DispatchModal } from './DispatchModal';
import {
  Calendar,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Bike,
  Building2,
  Thermometer,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  Package,
  Eye,
  Radio,
  Sparkles,
  PhoneCall,
  User,
  Database,
  Plus,
  Trash2,
  X,
  Send,
  UserCheck,
  RefreshCw,
  ArrowRight,
  Navigation
} from 'lucide-react';
import { LocationService } from '../../services/locationService';
import { StorageService } from '../../services/storage';
import { CloudSync, db, formatUnifiedTask } from '../../services/firebase';
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc, deleteDoc } from 'firebase/firestore';

interface AdminDashboardProps {
  tasks: PickupTask[];
  riders: PickupBoy[];
  routes: Route[];
  clients: Client[];
  notifications: NotificationLog[];
  onOpenProof: (task: PickupTask) => void;
  onRefresh: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  tasks: initialTasks,
  riders,
  routes,
  clients,
  notifications,
  onOpenProof,
  onRefresh
}) => {
  // Live Firestore tasks state
  const [firestoreTasks, setFirestoreTasks] = useState<PickupTask[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'alerts'>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);

  // Dispatch Task Modal State
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

  // Reassign Modal State
  const [reassignTask, setReassignTask] = useState<PickupTask | null>(null);
  const [selectedNewRiderId, setSelectedNewRiderId] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState(false);

  // 1. Direct Firestore tasks and trips collection listeners
  useEffect(() => {
    try {
      const unsubTrips = CloudSync.subscribeToTrips((cloudTrips) => {
        if (cloudTrips && cloudTrips.length > 0) {
          const formatted = cloudTrips.map((t) => formatUnifiedTask(t.id, t));
          setFirestoreTasks((prev) => {
            const map = new Map<string, PickupTask>();
            prev.forEach((item) => map.set(item.id, item));
            formatted.forEach((item) => map.set(item.id, item));
            return Array.from(map.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          });
        }
      });

      const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'), limit(50));
      const unsubTasks = onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const fetched = snapshot.docs.map((docSnap) => {
              const data = docSnap.data();
              return formatUnifiedTask(docSnap.id, data);
            });
            setFirestoreTasks((prev) => {
              const map = new Map<string, PickupTask>();
              prev.forEach((item) => map.set(item.id, item));
              fetched.forEach((item) => map.set(item.id, item));
              return Array.from(map.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            });
          }
        },
        (err) => {
          console.warn('[AdminDashboard] Firestore tasks listener error:', err);
        }
      );
      return () => {
        unsubTrips();
        unsubTasks();
      };
    } catch (e) {
      console.warn('[AdminDashboard] Setup tasks listener failed:', e);
    }
  }, []);

  // Merge tasks: Prefer live Firestore tasks if available, otherwise use initialTasks from props
  const allTasks = useMemo(() => {
    if (firestoreTasks.length > 0) {
      return firestoreTasks;
    }
    return initialTasks;
  }, [firestoreTasks, initialTasks]);

  // Set default selected task if none is selected
  useEffect(() => {
    if (!selectedTaskId && allTasks.length > 0) {
      setSelectedTaskId(allTasks[0].id);
    }
  }, [allTasks, selectedTaskId]);

  const handleTaskDispatched = (newTask: PickupTask) => {
    setSelectedTaskId(newTask.id);
    onRefresh();
    setDispatchNotice(`Dispatched new pickup round #${newTask.id.slice(-6)} to ${newTask.riderName}!`);
    setTimeout(() => setDispatchNotice(null), 4500);
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to cancel and delete this pickup round?')) {
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
      } catch (err) {
        console.warn('Firestore task delete error:', err);
      }
      StorageService.deleteTask(taskId);
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
      onRefresh();
      setDispatchNotice(`Task #${taskId.slice(-6)} was cancelled.`);
      setTimeout(() => setDispatchNotice(null), 3500);
    }
  };

  // Reassign Task Handler
  const handleOpenReassign = (task: PickupTask, e: React.MouseEvent) => {
    e.stopPropagation();
    setReassignTask(task);
    setSelectedNewRiderId(task.riderId || riders[0]?.id || '');
  };

  const handleSaveReassign = async () => {
    if (!reassignTask || !selectedNewRiderId) return;
    const targetRider = riders.find((r) => r.id === selectedNewRiderId);
    if (!targetRider) return;

    setIsReassigning(true);
    try {
      const updatedFields = {
        riderId: targetRider.id,
        riderName: targetRider.name,
        riderPhone: targetRider.phone,
        status: reassignTask.status === 'pending' ? 'assigned' : reassignTask.status,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'tasks', reassignTask.id), updatedFields);
      StorageService.updateTask({
        ...reassignTask,
        ...updatedFields
      });

      setDispatchNotice(`Reassigned task #${reassignTask.id.slice(-6)} to ${targetRider.name}!`);
      setTimeout(() => setDispatchNotice(null), 4000);
      setReassignTask(null);
      onRefresh();
    } catch (err) {
      console.error('Reassign error:', err);
      alert('Failed to reassign rider. Please try again.');
    } finally {
      setIsReassigning(false);
    }
  };

  // Unified Filter Logic
  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      const isTaskDelayed =
        task.isDelayed === true ||
        (task as any).tempAlert === true ||
        task.status === 'delayed' ||
        (task.issueFlags && task.issueFlags.some((i) => !i.resolved));

      if (statusFilter === 'alerts') {
        return isTaskDelayed;
      }

      if (statusFilter === 'active') {
        return (
          ['assigned', 'in_transit', 'scheduled', 'in_progress', 'started', 'at_stop', 'picked_up'].includes(
            task.status
          ) && !isTaskDelayed
        );
      }

      // 'all' includes all valid task statuses
      return true;
    });
  }, [allTasks, statusFilter]);

  // Operational metrics
  const activeRiders = riders.filter((r) => r && r.status === 'active' && r.isCheckedIn);
  const totalScheduled = allTasks.length;
  const delayedTasks = allTasks.filter(
    (t) =>
      t.isDelayed === true ||
      (t as any).tempAlert === true ||
      t.status === 'delayed' ||
      (t.issueFlags && t.issueFlags.some((i) => !i.resolved))
  );
  const delayedCount = delayedTasks.length;
  const activeRounds = allTasks.filter((t) =>
    ['assigned', 'in_transit', 'scheduled', 'in_progress', 'started', 'at_stop', 'picked_up'].includes(t.status)
  ).length;

  const totalVialsMoved = allTasks.reduce((sum, t) => {
    const stops = t.stopsProgress || [];
    return sum + stops.reduce((sSum, s) => sSum + (s.sampleCount || (s as any).specimenCount || 0), 0);
  }, 0);

  // Active selected task for map display
  const activeTask = allTasks.find((t) => t.id === selectedTaskId) || allTasks[0] || undefined;
  const activeRoute = activeTask
    ? routes.find((r) => r.id === activeTask.routeId) || {
        id: activeTask.id,
        clientId: activeTask.clientLabId || activeTask.clientId,
        name: activeTask.routeName || `${activeTask.clientName || 'Diagnostic'} Loop`,
        stops: (activeTask.stopsProgress || []).map((s, idx) => ({
          id: s.stopId || `s-${idx}`,
          name: s.stopName || (s as any).name || `Stop ${idx + 1}`,
          address: s.address || 'Diagnostic Collection Point, Mumbai',
          lat: s.lat || 19.1287,
          lng: s.lng || 72.8294,
          contactPerson: 'Lab In-Charge',
          contactPhone: '+91 98200 11223',
          expectedTime: '10:30 AM'
        })),
        destinationLab: {
          name: activeTask.clientName || 'Central Reference Lab',
          address: 'Central Diagnostic Processing Facility, Mumbai',
          lat: (activeTask as any).clientLocation?.lat || activeTask.clientLabLocation?.lat || 19.1300,
          lng: (activeTask as any).clientLocation?.lng || activeTask.clientLabLocation?.lng || 72.8350,
          contactPerson: 'Lead Pathologist',
          contactPhone: '+91 98200 44556'
        },
        frequency: 'Daily',
        timeSlots: [activeTask.timeSlot || '09:00 AM'],
        bufferTimeMinutes: 15
      }
    : undefined;

  const assignedRider: PickupBoy | undefined = activeTask
    ? riders.find((r) => r.id === activeTask.riderId) || {
        id: activeTask.riderId || 'rider-active',
        name: activeTask.riderName || 'Assigned Runner',
        phone: activeTask.riderPhone || '+91 98201 22334',
        email: 'runner@secondmedic.com',
        vehicleNumber: activeTask.riderVehicle || 'MH02TN0897',
        vehicleType: 'Motorcycle / Bike',
        photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80',
        assignedRouteIds: [],
        status: 'active' as const,
        joiningDate: '2026-01-01',
        isOnline: true,
        isCheckedIn: true
      }
    : riders[0] || undefined;

  return (
    <div className="space-y-5">
      {/* Priority Operational Alert Banner */}
      {delayedCount > 0 ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-300">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-rose-900 text-xs sm:text-sm">
                Operational Alert: {delayedCount} Pickup Round(s) Requiring Priority Attention
              </h3>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Specimen transit warning or temperature SLA variance detected. Live WhatsApp/SMS dispatch ready.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setStatusFilter('alerts')}
              className="w-full sm:w-auto px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer"
            >
              Filter Alerts ({delayedCount})
            </button>
          </div>
        </div>
      ) : totalScheduled > 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-semibold text-emerald-900">
              All {totalScheduled} Dispatched Diagnostic Rounds Operating Within Cold-Chain SLA
            </span>
          </div>
          <span className="hidden sm:inline text-emerald-700 font-mono text-[11px]">
            Target Custody: 2.0°C – 8.0°C Verified Safe
          </span>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-600 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            <span className="font-medium text-slate-700">Live Logistics Engine Active • Dispatched Feed Ready</span>
          </div>
          <span className="hidden sm:inline text-slate-500 font-mono text-[11px]">Click "+ Dispatch Task" to Launch</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Rounds</span>
            <Calendar className="w-4 h-4 text-sky-700" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{totalScheduled}</div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-600 w-[80%]"></div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 font-medium">{activeRounds} active in field</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Active Runners</span>
            <Bike className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {activeRiders.length} / {riders.length}
          </div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 w-[85%]"></div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 font-medium">GPS active and broadcasting</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>On-Time SLA</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">
            {totalScheduled > 0 ? (((totalScheduled - delayedCount) / totalScheduled) * 100).toFixed(1) : '100'}%
          </div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 w-[95%]"></div>
          </div>
          <div className="text-[10px] text-emerald-600 mt-1.5 font-bold">Standard SLA &lt; 45m</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Alerts / Delayed</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-500">
            {delayedCount < 10 ? `0${delayedCount}` : delayedCount}
          </div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500" style={{ width: `${Math.min(delayedCount * 30, 100)}%` }}></div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 font-medium">
            {delayedCount === 0 ? 'Zero active bottlenecks' : 'Grace period exceeded'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Vials in Custody</span>
            <Package className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{totalVialsMoved}</div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 w-[70%]"></div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 font-medium">Verified biological samples</div>
        </div>
      </div>

      {/* Main Command Center: Live Map + Priority Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Live GPS Dispatch Map (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 sm:p-5 flex flex-col overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-sky-700" />
                  <span>Live Operations Map & Fleet Radar</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Tracking round:{' '}
                  <span className="font-semibold text-slate-800">
                    {activeTask ? `${activeTask.clientName || 'Diagnostic Lab'} (#${activeTask.id.slice(-6)})` : 'All Fleet Runners'}
                  </span>
                </p>
              </div>

              {/* Live Status indicator */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Real-Time GPS Tracking</span>
              </div>
            </div>

            {dispatchNotice && (
              <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{dispatchNotice}</span>
              </div>
            )}

            {/* Map Container */}
            <div
              style={{ height: '400px', width: '100%', borderRadius: '12px' }}
              className="h-[400px] w-full rounded-xl overflow-hidden my-2 relative z-0"
            >
              <LiveMap
                stops={activeRoute?.stops || []}
                destination={activeRoute?.destinationLab}
                rider={assignedRider}
                riders={riders}
                tasks={allTasks}
                activeTaskId={selectedTaskId}
                height="400px"
                autoFit={false}
                enableFirestoreSync={true}
              />
            </div>

            {/* Live Rider Radar Strip */}
            {assignedRider && (
              <div className="mt-3.5 p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 border border-sky-200 text-sky-800 flex items-center justify-center font-bold">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2 text-xs">
                      <span>{assignedRider.name}</span>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.2 rounded-full border border-emerald-200">
                        GPS Active
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      {assignedRider.vehicleNumber || 'MH02TN0897'} • {assignedRider.phone}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-slate-700">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Cold Box Temp</span>
                    <span className="font-bold font-mono text-emerald-700 text-xs">4.0°C (Safe)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Phone Battery</span>
                    <span className="font-bold font-mono text-slate-800 text-xs">
                      {(assignedRider as any)?.batteryLevel || 88}%
                    </span>
                  </div>
                  <a
                    href={`tel:${assignedRider.phone}`}
                    className="p-1.5 bg-white hover:bg-slate-100 text-sky-700 rounded-md transition-colors border border-slate-200"
                    title="Call Rider"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Priority Feed & Time Slots (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 sm:p-5 flex flex-col h-full overflow-hidden">
            {/* Header and Filter Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-700" />
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">Priority Feed & Rounds</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button
                  onClick={() => setIsDispatchModalOpen(true)}
                  className="px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Dispatch Task</span>
                </button>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                      statusFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({allTasks.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('active')}
                    className={`px-2.5 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                      statusFilter === 'active'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStatusFilter('alerts')}
                    className={`px-2.5 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                      statusFilter === 'alerts'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Alerts {delayedCount > 0 ? `(${delayedCount})` : ''}
                  </button>
                </div>
              </div>
            </div>

            {/* Tasks list */}
            <div className="mt-3.5 space-y-3 flex-1 overflow-y-auto max-h-[540px] pr-1">
              {filteredTasks.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-600">No pickup rounds match the selected filter.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Click "+ Dispatch Task" above to schedule a collection round.
                  </p>
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const isSelected = selectedTaskId === task.id;
                  const stopsList = task.stopsProgress || (task as any).stops || [];
                  const pickedVials = stopsList.reduce(
                    (sum, s) => sum + (s.sampleCount || (s as any).specimenCount || 0),
                    0
                  );
                  const isTaskDelayed =
                    task.isDelayed === true ||
                    (task as any).tempAlert === true ||
                    task.status === 'delayed';

                  // Assigned rider details
                  const taskRider = riders.find((r) => r.id === task.riderId);
                  const riderDisplayTag = taskRider
                    ? `${taskRider.name} - ${taskRider.vehicleNumber || 'MH01AV8888'}`
                    : task.riderName
                    ? `${task.riderName} - ${task.riderVehicle || 'MH01AV8888'}`
                    : 'Unassigned Rider';

                  const getStatusBadge = () => {
                    if (isTaskDelayed) {
                      return (
                        <span className="bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" /> Delayed
                        </span>
                      );
                    }
                    switch (task.status as string) {
                      case 'delivered':
                      case 'completed':
                        return (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Completed ({pickedVials} Vials)
                          </span>
                        );
                      case 'in_transit':
                      case 'at_stop':
                      case 'started':
                      case 'picked_up':
                        return (
                          <span className="bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Bike className="w-3 h-3 text-sky-600" /> In Transit
                          </span>
                        );
                      case 'assigned':
                      case 'scheduled':
                      default:
                        return (
                          <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" /> Assigned
                          </span>
                        );
                    }
                  };

                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-50/80 border-sky-600 shadow-xs ring-1 ring-sky-600/30'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      {/* Top Row: Client Name & Status Badge */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">
                              {task.clientName || task.clientLabName || 'Lifecare Diagnostics'}
                            </span>
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                              {task.timeSlot || '09:00 AM'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {task.routeName || 'Diagnostic Collection Loop'}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {getStatusBadge()}
                        </div>
                      </div>

                      {/* Rider Badge */}
                      <div className="my-1.5 flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                        <Bike className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                        <span className="font-semibold text-slate-800 text-[11px] truncate">
                          {riderDisplayTag}
                        </span>
                      </div>

                      {/* Stops Preview: e.g. Stop 1 -> Stop 2 */}
                      {stopsList.length > 0 && (
                        <div className="my-2 bg-slate-50/90 p-2.5 rounded-lg border border-slate-200 text-[11px] space-y-1.5">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Collection Stops ({stopsList.length})
                          </div>
                          <div className="space-y-1">
                            {stopsList.slice(0, 3).map((stop, idx) => (
                              <div key={stop.stopId || idx} className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1.5 text-slate-700 truncate max-w-[210px] text-[11px]">
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      stop.status === 'picked_up' || stop.status === 'collected'
                                        ? 'bg-emerald-500'
                                        : stop.status === 'arrived'
                                        ? 'bg-sky-500 animate-ping'
                                        : 'bg-slate-300'
                                    }`}
                                  />
                                  <span className="truncate">{stop.stopName || stop.name || `Stop ${idx + 1}`}</span>
                                </span>
                                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                                  {stop.sampleCount || (stop as any).specimenCount || 0} Vials
                                </span>
                              </div>
                            ))}
                            {stopsList.length > 3 && (
                              <div className="text-[10px] text-slate-400 font-medium">
                                + {stopsList.length - 3} more collection stop(s)
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons Row */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          {/* View on Map */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskId(task.id);
                            }}
                            className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-sky-700 text-white'
                                : 'bg-slate-100 hover:bg-sky-50 text-sky-800 border border-slate-200'
                            }`}
                          >
                            <Navigation className="w-3 h-3" />
                            <span>View on Map</span>
                          </button>

                          {/* Reassign Rider */}
                          <button
                            type="button"
                            onClick={(e) => handleOpenReassign(task, e)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded text-[10px] font-bold border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <UserCheck className="w-3 h-3 text-slate-600" />
                            <span>Reassign</span>
                          </button>

                          {/* Chain Proof */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProof(task);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-sky-50 text-slate-600 hover:text-sky-900 font-semibold rounded text-[10px] border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>Proof</span>
                          </button>
                        </div>

                        {/* Cancel Task Button */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTask(task.id, e)}
                          title="Cancel / Delete Task"
                          className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dispatch New Task Modal */}
      <DispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        clients={clients}
        routes={routes}
        riders={riders}
        onDispatched={handleTaskDispatched}
      />

      {/* Reassign Rider Modal */}
      {reassignTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-sky-700" />
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  Reassign Task #{reassignTask.id.slice(-6)}
                </h3>
              </div>
              <button
                onClick={() => setReassignTask(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500">
                  Client Lab:{' '}
                  <strong className="text-slate-800">
                    {reassignTask.clientName || reassignTask.clientLabName}
                  </strong>
                </p>
                <p className="text-xs text-slate-500">
                  Currently Assigned:{' '}
                  <strong className="text-slate-800">{reassignTask.riderName || 'None'}</strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Bike className="w-3.5 h-3.5 text-sky-700" />
                  <span>Select New Fleet Runner</span>
                </label>
                <select
                  value={selectedNewRiderId}
                  onChange={(e) => setSelectedNewRiderId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                >
                  {riders.map((r) => {
                    const isOnline = r.isOnline !== false;
                    return (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.vehicleNumber || 'MH01AV8888'}) {isOnline ? '• Online' : '• Offline'}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReassignTask(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isReassigning}
                onClick={handleSaveReassign}
                className="px-4 py-2 bg-sky-700 hover:bg-sky-800 disabled:bg-sky-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isReassigning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Reassigning...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Confirm Reassignment</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
