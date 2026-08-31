import React from 'react';
import { UserAuth } from '../../types';
import { Bell, LogOut, Radio, Activity, ShieldCheck } from 'lucide-react';

interface AdminHeaderProps {
  user: UserAuth;
  onLogout: () => void;
  unreadNotifsCount: number;
  onOpenNotifications: () => void;
  isSimulating: boolean;
  onToggleSimulation: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  user,
  onLogout,
  unreadNotifsCount,
  onOpenNotifications,
  isSimulating,
  onToggleSimulation
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs text-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-4">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white shadow-xs font-bold text-sm shrink-0">
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-tight">
                SecondMedic <span className="text-sky-700 font-semibold">VialTrack</span>
              </h1>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] sm:text-xs font-bold uppercase tracking-wider border border-slate-200">
                Admin Ops Console
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium hidden md:block">
              Mumbai Diagnostic Specimen Cold-Chain Dispatch & Fleet Control
            </p>
          </div>
        </div>

        {/* Right Actions & Status */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Live Fleet Indicator */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600 font-medium bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>Live GPS Radar</span>
          </div>

          {/* Live Simulator Quick Control */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
            <Radio className={`w-3.5 h-3.5 ${isSimulating ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
            <button
              onClick={onToggleSimulation}
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
                isSimulating
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
              }`}
              title="Toggle simulated live GPS rider route movement"
            >
              {isSimulating ? 'Sim Active' : 'Start Sim'}
            </button>
          </div>

          {/* Notifications Button */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="View Live Alerts & WhatsApp/SMS Log"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          {/* User Profile info & Logout */}
          <div className="flex items-center gap-2.5 pl-2.5 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-800 leading-tight">{user.name}</div>
              <div className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">{user.email}</div>
            </div>

            <button
              onClick={onLogout}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-600 transition-colors text-xs flex items-center gap-1.5 cursor-pointer font-semibold"
              title="Exit Admin Console"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Exit Admin</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
