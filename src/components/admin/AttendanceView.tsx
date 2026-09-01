import React, { useState } from 'react';
import { AttendanceRecord, PickupBoy } from '../../types';
import { Calendar, Clock, MapPin, Download, CheckCircle, UserCheck, AlertCircle, Plus, X } from 'lucide-react';
import { StorageService } from '../../services/storage';

interface AttendanceViewProps {
  attendance: AttendanceRecord[];
  riders: PickupBoy[];
  onRefresh: () => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({ attendance, riders, onRefresh }) => {
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [isMarkingLeave, setIsMarkingLeave] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    riderId: riders[0]?.id || '',
    date: new Date().toISOString().split('T')[0],
    status: 'leave' as 'leave' | 'absent',
    reason: 'Medical Leave'
  });

  const handleExportCSV = () => {
    const headers = ['Rider Name', 'Date', 'Status', 'Check-In Time', 'Check-In Location', 'Check-Out Time', 'Total Hours'];
    const rows = attendance.map((a) => [
      `"${a.riderName}"`,
      `"${a.date}"`,
      `"${a.status}"`,
      `"${a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString('en-IN') : 'N/A'}"`,
      `"${a.checkInLocation?.address || 'N/A'}"`,
      `"${a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString('en-IN') : 'On Duty'}"`,
      `"${a.totalHours || 0}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SecondMedic_VialTrack_Attendance_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveLeave = (e: React.FormEvent) => {
    e.preventDefault();
    const rider = riders.find((r) => r.id === leaveForm.riderId);
    if (!rider) return;

    const record: AttendanceRecord = {
      id: `att-${Date.now()}`,
      riderId: rider.id,
      riderName: rider.name,
      date: leaveForm.date,
      checkInTime: '',
      checkInLocation: { lat: 0, lng: 0, address: 'N/A' },
      status: leaveForm.status,
      leaveReason: leaveForm.reason,
      totalHours: 0
    };

    StorageService.addAttendanceRecord(record);
    setIsMarkingLeave(false);
    onRefresh();
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-4 sm:p-5 rounded-xl shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-sky-700" />
            <span>Rider Attendance & Duty Logs</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time GPS check-in/out stamps, daily on-duty hours, and leave records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMarkingLeave(true)}
            className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4 text-sky-700" />
            <span>Mark Leave / Absent</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Rider</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Check-In Time & GPS</th>
                <th className="px-5 py-3">Check-Out Time</th>
                <th className="px-5 py-3">Total On-Duty Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">No attendance logs found.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Rider check-in logs will appear in real time.</p>
                  </td>
                </tr>
              ) : (
                attendance.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center font-bold text-xs">
                        {rec.riderName[0]}
                      </div>
                      <span>{rec.riderName}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-700">{rec.date}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rec.status === 'on_duty' || rec.status === 'present'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : rec.status === 'completed'
                            ? 'bg-sky-100 text-sky-800 border border-sky-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {rec.status === 'on_duty' ? 'On Duty (Active)' : rec.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {rec.checkInTime ? (
                        <div>
                          <div className="font-mono text-slate-800 font-medium">
                            {new Date(rec.checkInTime).toLocaleTimeString('en-IN')}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-sky-700" />
                            <span>{rec.checkInLocation?.address || 'Kandivali Hub, Mumbai'}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">N/A (Leave)</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-700">
                      {rec.checkOutTime ? (
                        new Date(rec.checkOutTime).toLocaleTimeString('en-IN')
                      ) : rec.status === 'on_duty' ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Active In Field
                        </span>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900 font-mono">
                      {rec.totalHours ? `${rec.totalHours.toFixed(1)} hrs` : '0.0 hrs'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark Leave Modal */}
      {isMarkingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Mark Rider Leave / Absence</h3>
              <button
                onClick={() => setIsMarkingLeave(false)}
                className="p-1 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLeave} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Select Rider
                </label>
                <select
                  value={leaveForm.riderId}
                  onChange={(e) => setLeaveForm({ ...leaveForm, riderId: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-sky-600"
                >
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.vehicleNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Date
                </label>
                <input
                  type="date"
                  value={leaveForm.date}
                  onChange={(e) => setLeaveForm({ ...leaveForm, date: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Leave Reason / Remarks
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bike Maintenance / Sick Leave"
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-sky-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMarkingLeave(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold transition-all shadow-xs cursor-pointer"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
