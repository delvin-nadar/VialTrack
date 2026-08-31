import React, { useState } from 'react';
import { UserRole } from '../../types';
import { RefreshCw, Smartphone, Laptop, Building2, Terminal, Database, Sparkles, CheckCircle2 } from 'lucide-react';
import { seedMumbaiFirestoreData } from '../../services/mumbaiSeed';

interface DemoSwitcherProps {
  currentRole?: UserRole;
  onSelectRole: (role: UserRole) => void;
  onResetData: () => void;
  onDataSeeded?: () => void;
}

export const DemoSwitcher: React.FC<DemoSwitcherProps> = ({
  currentRole,
  onSelectRole,
  onResetData,
  onDataSeeded
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  const handleSyncData = async () => {
    setIsSyncing(true);
    try {
      const res = await seedMumbaiFirestoreData();
      if (res.success) {
        setJustSynced(true);
        if (onDataSeeded) onDataSeeded();
        setTimeout(() => setJustSynced(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 text-xs">
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-bold text-slate-200 text-[11px] sm:text-xs">
            SecondMedic Live Operations Portal
          </span>
          <span className="hidden lg:inline text-slate-500 text-[11px]">
            Active Portals: <code className="bg-slate-800 text-sky-400 px-1 py-0.5 rounded font-mono">/admin</code>, <code className="bg-slate-800 text-teal-400 px-1 py-0.5 rounded font-mono">/client</code>, <code className="bg-slate-800 text-indigo-400 px-1 py-0.5 rounded font-mono">/rider</code>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick 1-Click Role Switchers */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => onSelectRole('admin')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentRole === 'admin'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Laptop className="w-3 h-3" />
              <span>Admin Console</span>
            </button>

            <button
              onClick={() => onSelectRole('client')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentRole === 'client'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Diagnostic Client</span>
            </button>

            <button
              onClick={() => onSelectRole('rider')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentRole === 'rider'
                  ? 'bg-sky-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>Pickup Boy (Rider)</span>
            </button>
          </div>

          {/* Sync Operations Data */}
          <button
            onClick={handleSyncData}
            disabled={isSyncing}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              justSynced
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-800 hover:bg-sky-950 text-sky-400 hover:text-sky-300 border-sky-800/60'
            }`}
            title="Sync live operational routes and locations to Firestore"
          >
            {justSynced ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-white" />
                <span>Synced</span>
              </>
            ) : (
              <>
                <Database className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Firestore'}</span>
                <span className="sm:hidden">Sync</span>
              </>
            )}
          </button>

          <button
            onClick={onResetData}
            className="px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 text-[11px] flex items-center gap-1 transition-colors cursor-pointer border border-slate-800"
            title="Reset to operational defaults"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden md:inline">Reset Defaults</span>
          </button>
        </div>
      </div>
    </div>
  );
};

