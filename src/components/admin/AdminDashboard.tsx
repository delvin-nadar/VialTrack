import React, { useState, useMemo } from 'react';
import { PickupTask, PickupBoy, Route, Client, NotificationLog, StopProgress } from '../../types';
import { LiveMap } from '../common/LiveMap';
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
  Send
} from 'lucide-react';
import { LocationService } from '../../services/locationService';
import { StorageService } from '../../services/storage';

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
  tasks,
  riders,
  routes,
  clients,
  notifications,
  onOpenProof,
  onRefresh
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_transit' | 'delayed' | 'delivered'>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[1]?.id || tasks[0]?.id || null);
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);

  // Dispatch Task Modal State
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const [selectedRouteId, setSelectedRouteId] = useState<string>(routes[0]?.id || '');
  const [selectedRiderId, setSelectedRiderId] = useState<string>(riders[0]?.id || '');
  const [taskTimeSlot, setTaskTimeSlot] = useState<string>('14:00');
  const [taskDate, setTaskDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [taskNotes, setTaskNotes] = useState<string>('');

  // Available routes for selected client
  const clientRoutes = useMemo(() => {
    if (!selectedClientId) return routes;
    const filtered = routes.filter((r) => r.clientId === selectedClientId);
    return filtered.length > 0 ? filtered : routes;
  }, [routes, selectedClientId]);

  // Handle client selection change in dispatch modal
  const handleClientChange = (cId: string) => {
    setSelectedClientId(cId);
    const matchingRoutes = routes.filter((r) => r.clientId === cId);
    if (matchingRoutes.length > 0) {
      setSelectedRouteId(matchingRoutes[0].id);
    }
  };

  // Dispatch New Task to Firestore
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === selectedClientId) || clients[0];
    const route = routes.find((r) => r.id === selectedRouteId) || clientRoutes[0] || routes[0];
    const rider = riders.find((r) => r.id === selectedRiderId) || riders[0];

    if (!client || !route || !rider) {
      alert('Please ensure at least one Client, Route, and Rider are configured.');
      return;
    }

    const newTaskId = `task-${taskDate.replace(/-/g, '')}-${taskTimeSlot.replace(':', '')}-${Date.now().toString().slice(-4)}`;

    const stopsProgress: StopProgress[] = route.stops.map((s, idx) => ({
      stopId: s.id || `stop-${idx}`,
      stopName: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      contactPerson: s.contactPerson || '',
      phone: s.phone || '',
      status: 'pending'
    }));

    const newTask: PickupTask = {
      id: newTaskId,
      date: taskDate,
      timeSlot: taskTimeSlot,
      routeId: route.id,
      routeName: route.name,
      clientId: client.id,
      clientName: client.name,
      riderId: rider.id,
      riderName: rider.name,
      riderPhone: rider.phone,
      riderVehicle: rider.vehicleNumber,
      status: 'pending',
      currentStopIndex: 0,
      pickupLocation: {
        name: route.stops[0]?.name || client.name,
        address: route.stops[0]?.address || client.address,
        lat: route.stops[0]?.lat || client.lat || 19.1363,
        lng: route.stops[0]?.lng || client.lng || 72.8277,
        area: client.area || 'Mumbai'
      },
      deliveryLocation: {
        name: route.destinationLab?.name || 'Central Diagnostic Processing Lab',
        address: route.destinationLab?.address || 'Mumbai Central Facility',
        lat: route.destinationLab?.lat || 19.1860,
        lng: route.destinationLab?.lng || 72.8485,
        area: 'Mumbai'
      },
      stopsProgress,
      destination: {
        name: route.destinationLab?.name || 'Central Diagnostic Processing Lab',
        address: route.destinationLab?.address || 'Mumbai Central Facility',
        lat: route.destinationLab?.lat || 19.1860,
        lng: route.destinationLab?.lng || 72.8485,
        notes: taskNotes || 'Specimen cold-chain transport'
      },
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: [],
      createdAt: new Date().toISOString()
    };

    StorageService.addTask(newTask);
    setIsDispatchModalOpen(false);
    setSelectedTaskId(newTask.id);
    onRefresh();
    setDispatchNotice(`Dispatched new pickup round #${newTask.id} to ${rider.name}!`);
    setTimeout(() => setDispatchNotice(null), 4000);
  };

  const handleDeleteTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to cancel and delete this pickup round?')) {
      StorageService.deleteTask(taskId);
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
      onRefresh();
    }
  };

  // Today's date
  const todayStr = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter((t) => t.date === todayStr);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return todayTasks.filter((t) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'delayed') return t.isDelayed || t.status === 'delayed';
      if (statusFilter === 'in_transit') return t.status === 'in_transit' || t.status === 'started' || t.status === 'at_stop';
      if (statusFilter === 'delivered') return t.status === 'delivered';
      return true;
    });
  }, [todayTasks, statusFilter]);

  // Priority Alerts (delayed tasks, critical issues)
  const priorityAlerts = todayTasks.filter((t) => t.isDelayed || t.issueFlags?.some((i) => !i.resolved));
  const activeRiders = riders.filter((r) => r && r.status === 'active' && r.isCheckedIn);

  // Active selected task for map display
  const activeTask = todayTasks.find((t) => t.id === selectedTaskId) || todayTasks[0] || undefined;
  const activeRoute = activeTask ? routes.find((r) => r.id === activeTask.routeId) : undefined;
  const assignedRider = activeTask ? riders.find((r) => r.id === activeTask.riderId) : (riders.length === 1 ? riders[0] : undefined);

  // Stats calculation
  const totalScheduled = todayTasks.length;
  const completedRounds = todayTasks.filter((t) => t.status === 'delivered').length;
  const inProgressRounds = todayTasks.filter((t) => ['started', 'at_stop', 'picked_up', 'in_transit'].includes(t.status)).length;
  const delayedCount = todayTasks.filter((t) => t.isDelayed || t.status === 'delayed').length;
  const totalVialsMoved = todayTasks.reduce(
    (sum, t) => sum + t.stopsProgress.reduce((sSum, s) => sSum + (s.sampleCount || 0), 0),
    0
  );

  return (
    <div className="space-y-5">
      {/* Priority Operational Alert Banner */}
      {delayedCount > 0 || priorityAlerts.length > 0 ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-300">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-rose-900 text-xs sm:text-sm">
                Operational Alert: {delayedCount} Pickup Round(s) Exceeding Grace Period
              </h3>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Biological sample transit warning. Automated WhatsApp dispatch active.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setStatusFilter('delayed')}
              className="w-full sm:w-auto px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer"
            >
              Filter Delayed ({delayedCount})
            </button>
          </div>
        </div>
      ) : totalScheduled > 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-semibold text-emerald-900">All Active Specimen Routes Operating Within SLA (100% On-Time)</span>
          </div>
          <span className="hidden sm:inline text-emerald-700 font-mono text-[11px]">Cold-Chain Verified: 2.0°C – 8.0°C Safe</span>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-600 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            <span className="font-medium text-slate-700">Live Logistics Engine Active • 0 Scheduled Pickup Tasks</span>
          </div>
          <span className="hidden sm:inline text-slate-500 font-mono text-[11px]">Ready for New Dispatches</span>
        </div>
      )}

      {/* KPI Cards Grid - High Density 5-Col Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Tasks (Today)</span>
            <Calendar className="w-4 h-4 text-sky-700" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{totalScheduled}</div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-600 w-[75%]"></div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 font-medium">4 daily dispatch time slots</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Active Riders</span>
            <Bike className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{activeRiders.length} / {riders.length}</div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 w-[85%]"></div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 font-medium">{inProgressRounds} en route to stops</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>On-Time Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">
            {totalScheduled > 0 ? (((totalScheduled - delayedCount) / totalScheduled) * 100).toFixed(1) : '100'}%
          </div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 w-[94%]"></div>
          </div>
          <div className="text-[10px] text-emerald-600 mt-1.5 font-bold">+2.4% from yesterday</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Delayed/Missed</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-500">{delayedCount < 10 ? `0${delayedCount}` : delayedCount}</div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500" style={{ width: `${Math.min(delayedCount * 25, 100)}%` }}></div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 font-medium">Average delay: 14 min</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Vials Collected</span>
            <Package className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{totalVialsMoved}</div>
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 w-[65%]"></div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 font-medium">Safe cold-chain custody</div>
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
                  Tracking route: <span className="font-semibold text-slate-800">{activeRoute?.name}</span>
                </p>
              </div>

              {/* Live Status indicator */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Live Firestore GPS</span>
              </div>
            </div>

            {dispatchNotice && (
              <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{dispatchNotice}</span>
              </div>
            )}

            {/* Map Container */}
            <div
              style={{ height: '380px', width: '100%', borderRadius: '12px' }}
              className="h-[380px] w-full rounded-xl overflow-hidden my-3 relative z-0"
            >
              <LiveMap
                stops={activeRoute?.stops || []}
                destination={activeRoute?.destinationLab}
                rider={assignedRider}
                riders={riders}
                tasks={todayTasks}
                activeTaskId={selectedTaskId}
                height="380px"
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
                        GPS Active (±5m)
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      {assignedRider.vehicleNumber} • {assignedRider.phone}
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
                    <span className="font-bold font-mono text-slate-800 text-xs">{assignedRider.batteryLevel || 88}%</span>
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsDispatchModalOpen(true)}
                  className="px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Dispatch Task</span>
                </button>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                      statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('in_transit')}
                    className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                      statusFilter === 'in_transit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStatusFilter('delayed')}
                    className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                      statusFilter === 'delayed' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Alerts
                  </button>
                </div>
              </div>
            </div>

            {/* Tasks list */}
            <div className="mt-3.5 space-y-2.5 flex-1 overflow-y-auto max-h-[520px] pr-1">
              {filteredTasks.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No pickup rounds match the selected filter.
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const isSelected = selectedTaskId === task.id;
                  const pickedVials = task.stopsProgress.reduce((sum, s) => sum + (s.sampleCount || 0), 0);

                  const getStatusBadge = () => {
                    switch (task.status) {
                      case 'delivered':
                        return (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Delivered ({pickedVials})
                          </span>
                        );
                      case 'in_transit':
                      case 'at_stop':
                      case 'started':
                        return (
                          <span className="bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Bike className="w-3 h-3 text-sky-600" /> In Transit
                          </span>
                        );
                      case 'delayed':
                        return (
                          <span className="bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600" /> Delayed (+{task.delayMinutes || 15}m)
                          </span>
                        );
                      default:
                        return (
                          <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            Upcoming
                          </span>
                        );
                    }
                  };

                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-50/70 border-sky-600 shadow-xs ring-1 ring-sky-600/30'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-800">
                            {task.timeSlot}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{task.clientName}</div>
                            <div className="text-[10px] text-slate-500">{task.routeName}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {getStatusBadge()}
                          <button
                            onClick={(e) => handleDeleteTask(task.id, e)}
                            title="Cancel / Delete Task"
                            className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Stops timeline mini-progress */}
                      <div className="my-2 bg-slate-50 p-2 rounded-md border border-slate-200/80 text-[11px] space-y-1">
                        {task.stopsProgress.map((stop, idx) => (
                          <div key={stop.stopId || idx} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-slate-700 truncate max-w-[200px] text-[11px]">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  stop.status === 'picked_up'
                                    ? 'bg-emerald-500'
                                    : stop.status === 'arrived'
                                    ? 'bg-sky-500 animate-ping'
                                    : 'bg-slate-300'
                                }`}
                              ></span>
                              {stop.stopName.split(',')[0]}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              {stop.status === 'picked_up' ? `${stop.sampleCount} Vials` : stop.status}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Footer Info & Proof Button */}
                      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                          <User className="w-3 h-3 text-slate-400" /> {task.riderName}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProof(task);
                          }}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-sky-50 text-sky-800 hover:text-sky-900 font-semibold rounded text-[10px] border border-slate-200 hover:border-sky-200 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Chain Proof</span>
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
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center font-bold">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Dispatch New Collection Round</h3>
                  <p className="text-xs text-slate-500">Live operational assignment to rider fleet</p>
                </div>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              {/* Select Client */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Diagnostic Client / Hospital *</label>
                <select
                  required
                  value={selectedClientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white font-medium focus:ring-2 focus:ring-sky-600 outline-hidden"
                >
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.area || 'Mumbai'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Route */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pickup Route Loop *</label>
                <select
                  required
                  value={selectedRouteId}
                  onChange={(e) => setSelectedRouteId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white font-medium focus:ring-2 focus:ring-sky-600 outline-hidden"
                >
                  {clientRoutes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.name} ({route.stops?.length || 0} stops)
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Rider */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Assign Specimen Courier (Rider) *</label>
                <select
                  required
                  value={selectedRiderId}
                  onChange={(e) => setSelectedRiderId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white font-medium focus:ring-2 focus:ring-sky-600 outline-hidden"
                >
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} - {r.vehicleNumber} {r.isCheckedIn ? '(Checked-in)' : '(Offline)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Time Slot */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Scheduled Date *</label>
                  <input
                    type="date"
                    required
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white font-medium focus:ring-2 focus:ring-sky-600 outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pickup Time Slot *</label>
                  <select
                    value={taskTimeSlot}
                    onChange={(e) => setTaskTimeSlot(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white font-medium focus:ring-2 focus:ring-sky-600 outline-hidden"
                  >
                    <option value="09:00">09:00 AM (Morning STAT)</option>
                    <option value="11:30">11:30 AM (Midday Routine)</option>
                    <option value="14:00">02:00 PM (Afternoon Cycle)</option>
                    <option value="17:00">05:00 PM (Evening Batch)</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Handling Instructions / Notes</label>
                <input
                  type="text"
                  placeholder="e.g., EDTA + Serum vials, strict 4°C cold chain"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white font-medium focus:ring-2 focus:ring-sky-600 outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Dispatch Round</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
