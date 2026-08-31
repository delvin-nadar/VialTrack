import React from 'react';
import { UserAuth, PickupBoy } from '../../types';
import { Bike, Bell, LogOut, Radio, Battery, Wifi, ShieldCheck } from 'lucide-react';

interface RiderHeaderProps {
  user: UserAuth;
  rider?: PickupBoy;
  onLogout: () => void;
  unreadNotifsCount: number;
  onOpenNotifications: () => void;
}

export const RiderHeader: React.FC<RiderHeaderProps> = ({
  user,
  rider,
  onLogout,
  unreadNotifsCount,
  onOpenNotifications
}) => {
  const isCheckedIn = rider?.isCheckedIn ?? true;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs text-slate-900">
      <div className="max-w-md md:max-w-4xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Rider Identification */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-sky-700 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden border border-sky-600 shadow-xs">
              {rider?.photoUrl ? (
                <img
                  src={rider.photoUrl}
                  alt={rider.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Bike className="w-4 h-4 text-white" />
              )}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                isCheckedIn ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            ></span>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                {rider?.name || user.name}
              </h1>
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${
                  isCheckedIn
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {isCheckedIn ? 'On Duty' : 'Off Shift'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              {rider?.vehicleNumber || 'MH-02-DN-4921'} • Courier
            </p>
          </div>
        </div>

        {/* Right Status & Exit */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Signal & GPS Status */}
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-medium">
            <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
            <span className="hidden sm:inline">GPS Active</span>
          </div>

          {/* Notifications Button */}
          <button
            onClick={onOpenNotifications}
            className="relative p-1.5 sm:p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="View Route & Dispatch Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-sky-600 text-white font-bold text-[9px] w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center shadow-xs">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          {/* Exit / Logout */}
          <button
            onClick={onLogout}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-600 transition-colors text-xs flex items-center gap-1 cursor-pointer font-semibold"
            title="Exit Rider App"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">Exit</span>
          </button>
        </div>
      </div>
    </header>
  );
};
