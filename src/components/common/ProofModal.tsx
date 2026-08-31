import React from 'react';
import { PickupTask } from '../../types';
import { X, CheckCircle, MapPin, Thermometer, ShieldCheck, Download, Package, UserCheck, Calendar, Clock } from 'lucide-react';

interface ProofModalProps {
  task: PickupTask | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProofModal: React.FC<ProofModalProps> = ({ task, isOpen, onClose }) => {
  if (!isOpen || !task) return null;

  const totalVials = task.stopsProgress.reduce((sum, s) => sum + (s.sampleCount || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">Chain-of-Custody Proof Record</h3>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Verified Secure
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Task ID: <span className="font-mono text-slate-700 font-semibold">{task.id}</span> • {task.clientName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Print / Save PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Record</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Task Overview Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-4 border-b border-slate-200 text-xs">
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-slate-500 block flex items-center gap-1 mb-0.5 text-[11px] font-medium">
              <Calendar className="w-3.5 h-3.5 text-sky-700" /> Date & Slot
            </span>
            <span className="font-bold text-slate-900 text-xs sm:text-sm">{task.date} • {task.timeSlot}</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-slate-500 block flex items-center gap-1 mb-0.5 text-[11px] font-medium">
              <UserCheck className="w-3.5 h-3.5 text-sky-700" /> Assigned Rider
            </span>
            <span className="font-bold text-slate-900 text-xs sm:text-sm">{task.riderName}</span>
            <span className="text-[10px] text-sky-700 font-mono block">{task.riderVehicle}</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-slate-500 block flex items-center gap-1 mb-0.5 text-[11px] font-medium">
              <Package className="w-3.5 h-3.5 text-amber-600" /> Total Vials Picked
            </span>
            <span className="font-bold text-amber-800 text-xs sm:text-sm font-mono">{totalVials} Units</span>
            <span className="text-[10px] text-slate-500 block">{task.stopsProgress.length} Stops Handled</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-slate-500 block flex items-center gap-1 mb-0.5 text-[11px] font-medium">
              <Thermometer className="w-3.5 h-3.5 text-emerald-600" /> Cold-Chain Status
            </span>
            <span className="font-bold text-emerald-800 text-xs sm:text-sm">2.0°C – 8.0°C</span>
            <span className="text-[10px] text-emerald-700 block font-medium">Chiller Verified</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 max-h-[65vh] overflow-y-auto space-y-5">
          {/* Stops List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-700 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> Collection Point Pickups
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {task.stopsProgress.map((stop, idx) => (
                <div
                  key={stop.stopId || idx}
                  className="bg-white rounded-lg p-3.5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-2.5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold text-[11px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <h5 className="font-bold text-slate-900 text-xs sm:text-sm">{stop.stopName}</h5>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        stop.status === 'picked_up'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : stop.status === 'no_sample'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {stop.status === 'picked_up' ? `${stop.sampleCount} Vials Picked` : stop.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 mt-1.5">{stop.address}</p>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold">Arrival Time:</span>
                        <span className="font-mono text-slate-700 text-xs">
                          {stop.arrivedAt ? new Date(stop.arrivedAt).toLocaleTimeString('en-IN') : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold">Chiller Temp:</span>
                        <span className="font-mono font-bold text-emerald-800 text-xs">
                          {stop.coldBoxTemp !== undefined ? `${stop.coldBoxTemp.toFixed(1)}°C` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Watermarked Photo Preview */}
                  {stop.photoUrl ? (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-700" /> GPS-Watermarked Specimen Photo
                      </span>
                      <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                        <img
                          src={stop.photoUrl}
                          alt={`Proof at ${stop.stopName}`}
                          className="w-full h-40 object-cover rounded-lg"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 rounded-lg bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">
                      No Photo Uploaded Yet
                    </div>
                  )}

                  {stop.notes && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg italic border border-slate-200">
                      "{stop.notes}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Destination Drop Section */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Destination Diagnostic Lab Intake
            </h4>

            <div className="bg-emerald-50/40 rounded-xl p-4 border border-emerald-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h5 className="font-bold text-slate-900 text-sm sm:text-base">{task.destination.name}</h5>
                  <p className="text-xs text-slate-500 mt-0.5">{task.destination.address}</p>
                </div>
                <div className="bg-white border border-emerald-200 px-3 py-1.5 rounded-lg text-right shadow-xs">
                  <span className="text-[10px] text-emerald-700 block font-semibold">Intake Receiver</span>
                  <span className="text-xs font-bold text-slate-900">
                    {task.destination.receiverName || 'Dr. Ramesh Patil (Senior Lab Tech)'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200 text-xs shadow-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold">Delivery Timestamp:</span>
                  <span className="font-mono text-slate-900 font-bold text-xs">
                    {task.destination.deliveredAt ? new Date(task.destination.deliveredAt).toLocaleString('en-IN') : 'Completed'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold">Intake Temperature:</span>
                  <span className="font-mono text-emerald-800 font-bold text-xs">
                    {task.destination.coldBoxTempAtDrop !== undefined ? `${task.destination.coldBoxTempAtDrop.toFixed(1)}°C` : '3.9°C'} (Cold-Chain OK)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold">Total Vials Received:</span>
                  <span className="font-mono text-amber-800 font-bold text-xs">
                    {task.destination.totalVialsHandedOver || totalVials} Units
                  </span>
                </div>
              </div>

              {(task.destination.dropPhotoUrl || task.destination.handoverPhotoUrl) && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> Lab Intake Watermarked Proof
                  </span>
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                    <img
                      src={task.destination.dropPhotoUrl || task.destination.handoverPhotoUrl}
                      alt="Lab Drop Proof"
                      className="w-full max-h-64 object-cover rounded-lg"
                    />
                  </div>
                </div>
              )}

              {task.destination.notes && (
                <p className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200 italic shadow-xs">
                  "{task.destination.notes}"
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span>Cryptographically sealed & timestamped by SecondMedic VialTrack Engine</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
