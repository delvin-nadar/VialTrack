import React from 'react';
import { UserAuth } from '../../types';
import { Building2, Bell, LogOut, ShieldCheck, PhoneCall } from 'lucide-react';

interface ClientHeaderProps {
  user: UserAuth;
  onLogout: () => void;
  unreadNotifsCount: number;
  onOpenNotifications: () => void;
}

export const ClientHeader: React.FC<ClientHeaderProps> = ({
  user,
  onLogout,
  unreadNotifsCount,
  onOpenNotifications
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs text-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-4">
        {/* Client Brand Logo & Lab Name */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center text-white shadow-xs font-bold text-sm shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-tight">
                {user.name.split('(')[0].trim()}
              </h1>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded text-[10px] sm:text-xs font-bold uppercase tracking-wider border border-emerald-200">
                Partner Lab Portal
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium hidden md:block">
              SecondMedic Specimen Intake & Live Cold-Chain Tracking
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Ops Support Hotline */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
            <span>Ops Hotline: <strong>+91 98200 99887</strong></span>
          </div>

          {/* Notifications Button */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="View Delivery Alerts & Pickup Updates"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-emerald-600 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          {/* Client Profile Info & Exit */}
          <div className="flex items-center gap-2.5 pl-2.5 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[140px]">{user.email}</div>
              <div className="text-[10px] text-emerald-700 font-medium">Verified Partner</div>
            </div>

            <button
              onClick={onLogout}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-600 transition-colors text-xs flex items-center gap-1.5 cursor-pointer font-semibold"
              title="Exit Client Portal"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Exit Lab</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
