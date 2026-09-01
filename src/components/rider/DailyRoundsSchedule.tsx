import React, { useState, useMemo } from 'react';
import { PickupTask, Route } from '../../types';
import {
  Clock,
  MapPin,
  PhoneCall,
  Navigation,
  Camera,
  CheckCircle2,
  AlertCircle,
  Building2,
  ChevronRight,
  ShieldCheck,
  Thermometer,
  Package,
  Layers,
  Sparkles,
  Search,
  Filter
} from 'lucide-react';

export interface ScheduleStopItem {
  id: string;
  uniqueKey: string;
  stopNumber: number;
  stopName: string;
  address: string;
  lat: number;
  lng: number;
  timeSlot: string;
  contactPerson: string;
  phone: string;
  status: 'pending' | 'in_transit' | 'collected';
  vialCount?: number;
  coldBoxTemp?: number;
  photoUrl?: string;
  photo2Url?: string;
  selfieUrl?: string;
  taskId?: string;
  task?: PickupTask;
  routeId: string;
  routeName: string;
  clientId: string;
  clientName: string;
  stopIndex: number;
  order: number;
}

interface DailyRoundsScheduleProps {
  scheduleStops: ScheduleStopItem[];
  assignedRoutes: Route[];
  activeTaskId?: string | null;
  onStartCollection: (stop: ScheduleStopItem) => void;
  onOpenProofModal: (task: PickupTask) => void;
  onSelectTask?: (taskId: string) => void;
}

export const DailyRoundsSchedule: React.FC<DailyRoundsScheduleProps> = ({
  scheduleStops,
  assignedRoutes,
  activeTaskId,
  onStartCollection,
  onOpenProofModal,
  onSelectTask
}) => {
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'pending' | 'in_transit' | 'collected'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract unique routes present in assigned stops
  const uniqueRouteNames = useMemo(() => {
    const names = new Set<string>();
    (scheduleStops || []).forEach((s) => {
      if (s?.routeName) names.add(s.routeName);
    });
    return Array.from(names);
  }, [scheduleStops]);

  // Counts for status tabs
  const counts = useMemo(() => {
    const safe = scheduleStops || [];
    return {
      all: safe.length,
      pending: safe.filter((s) => s?.status === 'pending').length,
      in_transit: safe.filter((s) => s?.status === 'in_transit').length,
      collected: safe.filter((s) => s?.status === 'collected').length
    };
  }, [scheduleStops]);

  // Filtered stops
  const filteredStops = useMemo(() => {
    return (scheduleStops || []).filter((stop) => {
      if (!stop) return false;
      // Route filter
      if (selectedRouteFilter !== 'all' && stop.routeName !== selectedRouteFilter && stop.routeId !== selectedRouteFilter) {
        return false;
      }
      // Status filter
      if (selectedStatusFilter !== 'all' && stop.status !== selectedStatusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = stop.stopName?.toLowerCase().includes(q);
        const matchAddr = stop.address?.toLowerCase().includes(q);
        const matchContact = stop.contactPerson?.toLowerCase().includes(q);
        const matchRoute = stop.routeName?.toLowerCase().includes(q);
        const matchClient = stop.clientName?.toLowerCase().includes(q);
        if (!matchName && !matchAddr && !matchContact && !matchRoute && !matchClient) {
          return false;
        }
      }
      return true;
    });
  }, [scheduleStops, selectedRouteFilter, selectedStatusFilter, searchQuery]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0 shadow-2xs">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <span>My Daily Rounds Schedule</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 font-mono">
                {scheduleStops.length} Stops
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sequenced daily collection stops across assigned loops and timing windows
            </p>
          </div>
        </div>

        {/* Status Counts Pill Summary */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              selectedStatusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('pending')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
              selectedStatusFilter === 'pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span>Pending</span>
            <span className="font-mono text-[11px]">({counts.pending})</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('in_transit')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
              selectedStatusFilter === 'in_transit'
                ? 'bg-sky-700 text-white shadow-xs'
                : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200'
            }`}
          >
            <span>In-Transit</span>
            <span className="font-mono text-[11px]">({counts.in_transit})</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('collected')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
              selectedStatusFilter === 'collected'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <span>Collected</span>
            <span className="font-mono text-[11px]">({counts.collected})</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
        {/* Search Input */}
        <div className="sm:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stop name, hospital, address, or contact..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-sky-600 focus:bg-white transition-all"
          />
        </div>

        {/* Route Filter Dropdown */}
        <div className="sm:col-span-6 flex items-center gap-2">
          <div className="relative flex-1">
            <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedRouteFilter}
              onChange={(e) => setSelectedRouteFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-hidden focus:border-sky-600 focus:bg-white transition-all appearance-none cursor-pointer"
            >
              <option value="all">All Assigned Loops & Routes ({uniqueRouteNames.length})</option>
              {uniqueRouteNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredStops.length === 0 && (
        <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">No Assigned Stops Found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery || selectedRouteFilter !== 'all' || selectedStatusFilter !== 'all'
                ? 'No stops match the selected filter criteria. Try resetting filters.'
                : 'No active collection stops are currently assigned to your rider profile. Check with Central Dispatch.'}
            </p>
          </div>
          {(searchQuery || selectedRouteFilter !== 'all' || selectedStatusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedRouteFilter('all');
                setSelectedStatusFilter('all');
              }}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-sky-700 border border-slate-200 rounded-lg font-bold text-xs shadow-2xs cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Stop Cards List */}
      <div className="space-y-3">
        {filteredStops.map((stop) => {
          const isCollected = stop.status === 'collected';
          const isInTransit = stop.status === 'in_transit';
          const isPending = stop.status === 'pending';
          const cleanPhone = (stop.phone || '').replace(/\D/g, '');

          return (
            <div
              key={stop.uniqueKey}
              className={`rounded-xl border transition-all shadow-xs overflow-hidden ${
                isCollected
                  ? 'bg-emerald-50/30 border-emerald-200'
                  : isInTransit
                  ? 'bg-sky-50/40 border-sky-300 ring-1 ring-sky-300/40'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Card Header Row: Stop Number, Time Slot Window, Status Badge */}
              <div className="p-3.5 sm:p-4 pb-2.5 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  {/* Stop Number Badge */}
                  <span
                    className={`px-2.5 py-1 rounded-md font-bold text-xs flex items-center gap-1.5 shadow-2xs ${
                      isCollected
                        ? 'bg-emerald-700 text-white'
                        : isInTransit
                        ? 'bg-sky-700 text-white'
                        : 'bg-slate-800 text-white'
                    }`}
                  >
                    {isCollected ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                    <span>Stop {stop.stopNumber}</span>
                  </span>

                  {/* Pickup Window / Slot Time Badge */}
                  <span className="px-2.5 py-1 rounded-md font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-200 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sky-700" />
                    <span>Slot: {stop.timeSlot}</span>
                  </span>

                  {/* Route Name Pill */}
                  <span className="hidden md:inline-flex text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 truncate max-w-[200px]">
                    {stop.routeName}
                  </span>
                </div>

                {/* Status Badge */}
                <div>
                  {isCollected && (
                    <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Collected</span>
                    </span>
                  )}
                  {isInTransit && (
                    <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-sky-100 text-sky-900 border border-sky-300 flex items-center gap-1.5 shadow-2xs">
                      <Navigation className="w-3.5 h-3.5 text-sky-600 animate-pulse" />
                      <span>In-Transit</span>
                    </span>
                  )}
                  {isPending && (
                    <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Pending Pickup</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Card Body: Hospital Details & Contact Person */}
              <div className="p-3.5 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base flex items-start gap-1.5">
                      <Building2 className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                      <span>{stop.stopName}</span>
                    </h4>
                    <p className="text-xs text-slate-600 flex items-start gap-1.5 leading-relaxed">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{stop.address}</span>
                    </p>
                    {stop.clientName && (
                      <p className="text-[11px] text-slate-400">
                        Client Hub: <span className="text-slate-600 font-semibold">{stop.clientName}</span>
                      </p>
                    )}
                  </div>

                  {/* Contact Person & Quick Phone/Nav Actions */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 sm:min-w-[220px] space-y-2 shrink-0 shadow-2xs">
                    <div className="text-xs text-slate-700 font-medium">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                        Hospital Contact
                      </span>
                      <span className="font-bold text-slate-900 block truncate">{stop.contactPerson || 'Lab Coordinator'}</span>
                      <span className="font-mono text-xs text-slate-600">{stop.phone || 'No phone'}</span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
                      {stop.phone && (
                        <a
                          href={`tel:${cleanPhone}`}
                          className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-md border border-emerald-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95 shadow-2xs"
                          title="Call Hospital Contact"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Call</span>
                        </a>
                      )}
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-1.5 px-2 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-md border border-sky-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95 shadow-2xs"
                        title="Open in Google Maps"
                      >
                        <Navigation className="w-3.5 h-3.5 text-sky-700" />
                        <span>Navigate</span>
                      </a>
                    </div>
                  </div>
                </div>

                {/* Bottom Action / Collection Status Row */}
                <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  {/* Left info */}
                  <div className="text-xs">
                    {isCollected ? (
                      <div className="flex items-center gap-3 text-emerald-800 font-medium">
                        <span className="flex items-center gap-1 font-bold">
                          <Package className="w-4 h-4 text-emerald-600" />
                          <span>{stop.vialCount ?? 0} Vials Collected</span>
                        </span>
                        {stop.coldBoxTemp !== undefined && (
                          <span className="flex items-center gap-1 text-slate-600 font-mono text-[11px]">
                            <Thermometer className="w-3.5 h-3.5 text-sky-600" />
                            <span>{stop.coldBoxTemp}°C</span>
                          </span>
                        )}
                        <span className="text-[11px] text-emerald-700 font-bold">✓ 2-Photo Proof Geotagged</span>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-xs flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Awaiting Specimen Pickup & Photo Verification</span>
                      </div>
                    )}
                  </div>

                  {/* Right Action Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!isCollected ? (
                      <button
                        type="button"
                        onClick={() => onStartCollection(stop)}
                        className="w-full sm:w-auto px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Start Collection / Upload 2-Photo Proof</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        {stop.task && (
                          <button
                            type="button"
                            onClick={() => onOpenProofModal(stop.task!)}
                            className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                          >
                            <ShieldCheck className="w-4 h-4 text-emerald-700" />
                            <span>View 2-Photo Proof</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onStartCollection(stop)}
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-xs rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Update photo proof or vial count"
                        >
                          Update Photos
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
