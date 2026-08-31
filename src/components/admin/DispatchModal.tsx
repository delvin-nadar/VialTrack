import React, { useState, useEffect } from 'react';
import { Client, Route, PickupBoy, PickupTask } from '../../types';
import { CloudSync } from '../../services/firebase';
import { StorageService } from '../../services/storage';
import {
  X,
  Send,
  Building2,
  Bike,
  Route as RouteIcon,
  Clock,
  Calendar,
  Plus,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface DispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  routes: Route[];
  riders: PickupBoy[];
  onDispatched: (task: PickupTask) => void;
}

export const DispatchModal: React.FC<DispatchModalProps> = ({
  isOpen,
  onClose,
  clients,
  routes,
  riders,
  onDispatched
}) => {
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [selectedRiderId, setSelectedRiderId] = useState<string>('');
  const [taskDate, setTaskDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [taskTimeSlot, setTaskTimeSlot] = useState<string>('09:00');
  const [taskNotes, setTaskNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Editable stops for fine-tuning before dispatch
  const [customStops, setCustomStops] = useState<
    Array<{
      id: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
      specimenCount: number;
    }>
  >([]);

  // Initialize selections when modal opens or props change
  useEffect(() => {
    if (isOpen) {
      const initialClient = clients[0];
      const initialClientId = initialClient?.id || '';
      setSelectedClientId(initialClientId);

      const matchingRoutes = routes.filter((r) => r.clientId === initialClientId);
      const initialRoute = matchingRoutes[0] || routes[0];
      setSelectedRouteId(initialRoute?.id || '');

      const activeRiders = riders.filter((r) => r.status === 'active' && r.isOnline !== false);
      const initialRider = activeRiders[0] || riders[0];
      setSelectedRiderId(initialRider?.id || '');

      setTaskDate(new Date().toISOString().split('T')[0]);
      setTaskTimeSlot(initialRoute?.timeSlots?.[0] || '09:00');
      setTaskNotes('');

      if (initialRoute?.stops) {
        setCustomStops(
          initialRoute.stops.map((s, idx) => ({
            id: s.id || `stop-${idx}`,
            name: s.name,
            address: s.address,
            lat: Number(s.lat || 19.1287852),
            lng: Number(s.lng || 72.8294183),
            specimenCount: Number((s as any).specimenCount || (s as any).sampleCount || 8)
          }))
        );
      }
    }
  }, [isOpen, clients, routes, riders]);

  // Update route and stops when client changes
  const handleClientChange = (cId: string) => {
    setSelectedClientId(cId);
    const matchingRoutes = routes.filter((r) => r.clientId === cId);
    const targetRoute = matchingRoutes[0] || routes[0];
    if (targetRoute) {
      setSelectedRouteId(targetRoute.id);
      if (targetRoute.stops) {
        setCustomStops(
          targetRoute.stops.map((s, idx) => ({
            id: s.id || `stop-${idx}`,
            name: s.name,
            address: s.address,
            lat: Number(s.lat || 19.1287852),
            lng: Number(s.lng || 72.8294183),
            specimenCount: Number((s as any).specimenCount || (s as any).sampleCount || 8)
          }))
        );
      }
    }
  };

  // Update stops when route selection changes
  const handleRouteChange = (rId: string) => {
    setSelectedRouteId(rId);
    const targetRoute = routes.find((r) => r.id === rId);
    if (targetRoute?.stops) {
      setCustomStops(
        targetRoute.stops.map((s, idx) => ({
          id: s.id || `stop-${idx}`,
          name: s.name,
          address: s.address,
          lat: Number(s.lat || 19.1287852),
          lng: Number(s.lng || 72.8294183),
          specimenCount: Number((s as any).specimenCount || (s as any).sampleCount || 8)
        }))
      );
      if (targetRoute.timeSlots && targetRoute.timeSlots.length > 0) {
        setTaskTimeSlot(targetRoute.timeSlots[0]);
      }
    }
  };

  const handleAddStop = () => {
    const newIdx = customStops.length + 1;
    setCustomStops([
      ...customStops,
      {
        id: `stop-custom-${Date.now()}`,
        name: `Collection Center OPD #${newIdx}`,
        address: 'Diagnostic Collection Point, Mumbai',
        lat: 19.1500,
        lng: 72.8400,
        specimenCount: 5
      }
    ]);
  };

  const handleRemoveStop = (index: number) => {
    setCustomStops(customStops.filter((_, idx) => idx !== index));
  };

  const handleUpdateStopSpecimenCount = (index: number, count: number) => {
    const updated = [...customStops];
    updated[index].specimenCount = Math.max(0, count);
    setCustomStops(updated);
  };

  const totalSpecimens = customStops.reduce((sum, s) => sum + (s.specimenCount || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === selectedClientId) || clients[0];
    const route = routes.find((r) => r.id === selectedRouteId) || routes[0];
    const rider = riders.find((r) => r.id === selectedRiderId) || riders[0];

    if (!client || !rider) {
      alert('Please select both a Client Diagnostic Lab and an Assigned Rider.');
      return;
    }

    if (customStops.length === 0) {
      alert('Please configure at least one collection stop for this round.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Direct unified dispatch to Firestore 'tasks'
      const newTask = await CloudSync.dispatchTask({
        client: {
          id: client.id,
          name: client.name,
          lat: Number(client.lat || (client as any).location?.lat || 19.1287852),
          lng: Number(client.lng || (client as any).location?.lng || 72.8294183),
          address: client.address
        },
        rider: {
          id: rider.id,
          name: rider.name,
          phone: rider.phone,
          vehicleNumber: rider.vehicleNumber
        },
        stops: customStops.map((s) => ({
          stopName: s.name,
          name: s.name,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          specimenCount: s.specimenCount,
          sampleCount: s.specimenCount,
          status: 'pending'
        })),
        route,
        timeSlot: taskTimeSlot,
        scheduledDate: taskDate,
        taskNotes
      });

      // Update local storage record for offline durability
      StorageService.addTask(newTask);

      onDispatched(newTask);
      onClose();
    } catch (err) {
      console.error('Dispatch error:', err);
      alert('Failed to dispatch task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-700 text-white flex items-center justify-center shadow-xs">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                Dispatch Real-time Collection Round
              </h3>
              <p className="text-xs text-slate-500">
                Real-time synchronization across Admin, Courier Fleet, and Client Labs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Client & Rider Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Client Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-sky-700" />
                <span>Client Diagnostic Center / Lab</span>
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => handleClientChange(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition-all"
                required
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.area || 'Mumbai'})
                  </option>
                ))}
              </select>
            </div>

            {/* Rider Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Bike className="w-3.5 h-3.5 text-sky-700" />
                <span>Assigned Fleet Runner</span>
              </label>
              <select
                value={selectedRiderId}
                onChange={(e) => setSelectedRiderId(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition-all"
                required
              >
                {riders.map((r) => {
                  const isOnline = r.isOnline !== false;
                  return (
                    <option key={r.id} value={r.id}>
                      {r.name} • {r.phone} {isOnline ? '(Online)' : '(Offline)'}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Route Template & Time Slot Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <RouteIcon className="w-3.5 h-3.5 text-sky-700" />
                <span>Loop Template</span>
              </label>
              <select
                value={selectedRouteId}
                onChange={(e) => handleRouteChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition-all"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-700" />
                <span>Scheduled Date</span>
              </label>
              <input
                type="date"
                value={taskDate}
                onChange={(e) => setTaskDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-700" />
                <span>Time Slot</span>
              </label>
              <select
                value={taskTimeSlot}
                onChange={(e) => setTaskTimeSlot(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition-all"
                required
              >
                <option value="08:00">08:00 AM (Early Loop)</option>
                <option value="09:00">09:00 AM (Morning STAT)</option>
                <option value="10:00">10:00 AM (Morning Regular)</option>
                <option value="12:00">12:00 PM (Noon Pickup)</option>
                <option value="14:00">02:00 PM (Post-Lunch)</option>
                <option value="16:00">04:00 PM (Evening Intake)</option>
                <option value="18:00">06:00 PM (Evening Batch)</option>
                <option value="20:00">08:00 PM (Night Clearance)</option>
              </select>
            </div>
          </div>

          {/* Stops List & Specimen Allocation */}
          <div className="space-y-2.5 bg-slate-50/80 p-3.5 sm:p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Collection Stops ({customStops.length} Total)
                </span>
                <span className="text-[11px] text-slate-500">
                  Total Specimens Scheduled: <strong className="text-emerald-700">{totalSpecimens} Vials</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddStop}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-sky-700" />
                <span>Add Stop</span>
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {customStops.map((stop, idx) => (
                <div
                  key={stop.id || idx}
                  className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-900 truncate">{stop.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{stop.address}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-bold text-slate-500">Vials:</label>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={stop.specimenCount}
                        onChange={(e) => handleUpdateStopSpecimenCount(idx, parseInt(e.target.value) || 0)}
                        className="w-14 px-2 py-1 text-center bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-800 focus:ring-1 focus:ring-sky-500 focus:outline-hidden"
                      />
                    </div>
                    {customStops.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStop(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Special Handling Notes / Requisition Instructions</span>
            </label>
            <input
              type="text"
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              placeholder="e.g., EDTA lavender vials on ice, STAT blood culture transport"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition-all"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-sky-700 hover:bg-sky-800 disabled:bg-sky-400 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-98"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Dispatching to Fleet...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Dispatch Task</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
