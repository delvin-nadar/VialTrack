import React, { useState } from 'react';
import { UserAuth } from '../../types';
import { Smartphone, Phone, Lock, AlertCircle, ArrowRight, CheckCircle2, Bike, ShieldCheck } from 'lucide-react';
import { StorageService } from '../../services/storage';
import { signInDemoAccount } from '../../services/firebase';

interface RiderLoginProps {
  onLoginSuccess: (user: UserAuth) => void;
}

export const RiderLogin: React.FC<RiderLoginProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('rahul.sharma@vialtrack.in');
  const [pin, setPin] = useState('1234');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier) {
      setError('Please enter your rider phone number or email.');
      return;
    }

    setLoading(true);
    signInDemoAccount('rider')
      .catch((err) => console.warn('[RiderLogin] Firebase Auth notice:', err))
      .finally(() => {
        setLoading(false);
        const riders = StorageService.getRiders();
        const matchedRider =
          riders.find(
            (r) =>
              r.email.toLowerCase() === identifier.toLowerCase() ||
              r.phone.replace(/\D/g, '').includes(identifier.replace(/\D/g, ''))
          ) || riders[0];

        const user: UserAuth = {
          id: `user-${matchedRider?.id || 'rider-rahul'}`,
          email: matchedRider?.email || 'rahul-demo@secondmedic.com',
          name: matchedRider?.name || 'Rahul Sharma',
          role: 'rider',
          riderId: matchedRider?.id || 'rider-rahul',
          phone: matchedRider?.phone || '+91 98765 43210',
          avatar: matchedRider?.photoUrl
        };
        onLoginSuccess(user);
      });
  };

  const handleDemoFill = () => {
    setIdentifier('rahul.sharma@vialtrack.in');
    setPin('1234');
    setError(null);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8 max-w-md mx-auto">
      <div className="w-full bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs relative">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <Bike className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">VialTrack — Rider Portal</h2>
          <p className="text-xs text-slate-500 mt-1">
            Specimen Pickup & Cold-Chain Delivery App
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile-Optimized PWA Edition</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Rider Phone or Email
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="+91 98765 43210 or email"
                className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-sky-600 focus:ring-1 focus:ring-sky-600 transition-all font-mono"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              Provided by SecondMedic Ops Dispatch
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Security PIN / Password
              </label>
              <span className="text-[11px] text-slate-500">Default: 1234</span>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="4-digit PIN or password"
                className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-sky-600 focus:ring-1 focus:ring-sky-600 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1.5 py-2.5 px-4 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            {loading ? 'Starting Duty...' : 'Login & Open My Schedule'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Fast Login */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleDemoFill}
            className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer active:scale-98 shadow-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-700" />
            <span>Fill Rahul Sharma Credentials</span>
          </button>
        </div>

        <div className="mt-4 text-center">
          <span className="text-[11px] text-slate-500">Powered by </span>
          <span className="text-[11px] font-bold text-sky-700">SecondMedic</span>
        </div>
      </div>
    </div>
  );
};
