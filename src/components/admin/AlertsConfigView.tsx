import React, { useState } from 'react';
import { Bell, ShieldAlert, Sliders, MessageSquare, Send, CheckCircle2, AlertTriangle, Thermometer, MapPin, Trash2, RefreshCw } from 'lucide-react';
import { NotificationService } from '../../services/notificationService';
import { cleanupFirestoreCollections } from '../../services/firebase';

interface AlertsConfigViewProps {
  onRefresh: () => void;
}

export const AlertsConfigView: React.FC<AlertsConfigViewProps> = ({ onRefresh }) => {
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(15);
  const [minTemp, setMinTemp] = useState(2.0);
  const [maxTemp, setMaxTemp] = useState(8.0);
  const [enableWhatsApp, setEnableWhatsApp] = useState(true);
  const [enableSMS, setEnableSMS] = useState(true);
  const [enableInApp, setEnableInApp] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleSendTestAlert = () => {
    NotificationService.sendAlert({
      type: 'delay',
      title: 'TEST ALERT: Pickup Delayed (+15m)',
      message: 'Automated test simulation: Courier partner delayed on scheduled route (Slot 14:00).',
      recipientRole: 'admin',
      channel: 'both'
    });
    setTestSent(true);
    onRefresh();
    setTimeout(() => setTestSent(false), 3000);
  };

  const handleCleanDatabase = async () => {
    if (!window.confirm('Are you sure you want to clean up all Firestore collections (clients, locations, riders, routes, tasks)? This will leave the database completely empty so you can create new production records.')) {
      return;
    }

    setIsCleaning(true);
    setCleanupMessage(null);
    try {
      const res = await cleanupFirestoreCollections();
      setCleanupMessage(res.message);
      onRefresh();
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      setCleanupMessage(`Error: ${err?.message || 'Failed to cleanup database'}`);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-xl shadow-xs">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-sky-700" />
          <span>Automated Operational Rules & Alert Thresholds</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure automated SLA monitoring, grace periods, cold-chain temperature thresholds, and notification channels.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* SLA Grace Period */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Pickup Slot Delay Detection (Grace Period)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Time allowed past the scheduled slot before auto-flagging delay and notifying client/admin.
              </p>
            </div>
            <span className="font-mono font-bold text-amber-800 text-sm sm:text-base bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              {gracePeriodMinutes} Minutes
            </span>
          </div>

          <div className="space-y-2">
            <input
              type="range"
              min="5"
              max="45"
              step="5"
              value={gracePeriodMinutes}
              onChange={(e) => setGracePeriodMinutes(Number(e.target.value))}
              className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-sky-700"
            />
            <div className="flex justify-between text-[11px] text-slate-400 font-mono">
              <span>5 min (Strict)</span>
              <span>15 min (Standard)</span>
              <span>30 min</span>
              <span>45 min (Lenient)</span>
            </div>
          </div>
        </div>

        {/* Cold-Chain Limits */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-sky-700" />
                <span>Cold-Chain Biological Safe Range</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Alarms sound if chiller box temperature reading falls outside this certified range.
              </p>
            </div>
            <span className="font-mono font-bold text-emerald-800 text-xs sm:text-sm bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              {minTemp}°C to {maxTemp}°C
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                Minimum Temperature (°C)
              </label>
              <input
                type="number"
                step="0.5"
                value={minTemp}
                onChange={(e) => setMinTemp(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                Maximum Temperature (°C)
              </label>
              <input
                type="number"
                step="0.5"
                value={maxTemp}
                onChange={(e) => setMaxTemp(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
              />
            </div>
          </div>
        </div>

        {/* Notification Channels */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5">
          <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2 pb-3 border-b border-slate-100">
            <MessageSquare className="w-4 h-4 text-sky-700" />
            <span>Automated Notification Channels</span>
          </h3>

          <div className="space-y-2.5 text-xs">
            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
              <div>
                <span className="font-bold text-slate-900 block">WhatsApp Automated Updates</span>
                <span className="text-slate-500 text-[11px]">
                  Instant WhatsApp alerts to hospital contact person on pickup and delivery.
                </span>
              </div>
              <input
                type="checkbox"
                checked={enableWhatsApp}
                onChange={(e) => setEnableWhatsApp(e.target.checked)}
                className="rounded border-slate-300 text-sky-700 w-4 h-4 focus:ring-sky-600"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
              <div>
                <span className="font-bold text-slate-900 block">SMS Fallback Alerts</span>
                <span className="text-slate-500 text-[11px]">
                  High-priority SMS alerts for delayed loops or temperature alerts.
                </span>
              </div>
              <input
                type="checkbox"
                checked={enableSMS}
                onChange={(e) => setEnableSMS(e.target.checked)}
                className="rounded border-slate-300 text-sky-700 w-4 h-4 focus:ring-sky-600"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
              <div>
                <span className="font-bold text-slate-900 block">In-App Push & Sound Alerts</span>
                <span className="text-slate-500 text-[11px]">
                  Real-time notification bell and browser audio chimes for Ops team.
                </span>
              </div>
              <input
                type="checkbox"
                checked={enableInApp}
                onChange={(e) => setEnableInApp(e.target.checked)}
                className="rounded border-slate-300 text-sky-700 w-4 h-4 focus:ring-sky-600"
              />
            </label>
          </div>
        </div>

        {/* Save & Test Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleSendTestAlert}
            className="w-full sm:w-auto px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-sky-700 font-bold text-xs rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{testSent ? 'Test Alert Broadcasted!' : 'Send Test Alert to Ops'}</span>
          </button>

          <button
            type="submit"
            className="w-full sm:w-auto px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Configuration Saved!</span>
              </>
            ) : (
              <span>Save Alert Rules</span>
            )}
          </button>
        </div>
      </form>

      {/* Database Maintenance & Production Cleanup */}
      <div className="bg-white border border-rose-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3 mt-8">
        <div className="flex items-center justify-between pb-3 border-b border-rose-100">
          <div>
            <h3 className="font-bold text-rose-900 text-sm sm:text-base flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Strict Production Database Cleanup</span>
            </h3>
            <p className="text-xs text-rose-600 mt-0.5">
              Purge all collections (clients, locations, riders, routes, tasks) to start with a pure empty database.
            </p>
          </div>
        </div>

        {cleanupMessage && (
          <div className="p-3 bg-slate-900 text-white rounded-lg text-xs font-mono">
            {cleanupMessage}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-500">
            Use this action when switching to production or preparing to register clean client accounts and pickup boy profiles from scratch.
          </p>
          <button
            type="button"
            onClick={handleCleanDatabase}
            disabled={isCleaning}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 cursor-pointer shrink-0 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCleaning ? 'animate-spin' : ''}`} />
            <span>{isCleaning ? 'Cleaning Database...' : 'Wipe All Collections'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
