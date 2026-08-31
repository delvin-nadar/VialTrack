import React, { useState } from 'react';
import { UserAuth } from '../../types';
import { Smartphone, Phone, Lock, AlertCircle, ArrowRight, Bike, ArrowLeft } from 'lucide-react';
import { StorageService } from '../../services/storage';
import { auth, signInWithEmailAndPassword } from '../../services/firebase';

interface RiderLoginProps {
  onLoginSuccess: (user: UserAuth) => void;
  onBackToLanding?: () => void;
}

export const RiderLogin: React.FC<RiderLoginProps> = ({ onLoginSuccess, onBackToLanding }) => {
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanIdentifier = identifier.trim().toLowerCase();

    if (!cleanIdentifier) {
      setError('Please enter your rider phone number or email.');
      return;
    }

    if (!pin) {
      setError('Please enter your security PIN or password.');
      return;
    }

    setLoading(true);

    try {
      const riders = StorageService.getRiders();
      const cleanPhone = cleanIdentifier.replace(/\D/g, '');
      const matchedRider = riders.find(
        (r) =>
          r.email.toLowerCase() === cleanIdentifier ||
          (cleanPhone.length >= 6 && r.phone.replace(/\D/g, '').includes(cleanPhone)) ||
          r.id.toLowerCase() === cleanIdentifier
      );

      // Determine corresponding Firebase account email
      const emailToAuth = cleanIdentifier.includes('@')
        ? cleanIdentifier
        : (matchedRider?.email || `${cleanIdentifier}@secondmedic.com`);

      // 1. Strict Firebase Authentication verification exclusively
      const userCredential = await signInWithEmailAndPassword(auth, emailToAuth, pin);

      if (!userCredential || !userCredential.user) {
        throw new Error('No user credential returned');
      }

      const fbUser = userCredential.user;
      const user: UserAuth = {
        id: fbUser.uid || `user-${matchedRider?.id || 'rider-rahul'}`,
        email: emailToAuth,
        name: fbUser.displayName || matchedRider?.name || 'Rahul Sharma (Courier)',
        role: 'rider',
        riderId: matchedRider?.id || 'rider-rahul',
        phone: matchedRider?.phone || '+91 98765 43210',
        avatar: matchedRider?.photoUrl
      };

      onLoginSuccess(user);
    } catch (authError: any) {
      console.warn('[RiderLogin] Firebase authentication failed:', authError?.code || authError?.message);
      // Keep user on login screen, do not update auth state, show red banner
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8 max-w-md mx-auto">
      <div className="w-full bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs relative">
        {onBackToLanding && (
          <button
            type="button"
            onClick={onBackToLanding}
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Portal Selection</span>
          </button>
        )}

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

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3.5">
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
                autoComplete="off"
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
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="new-password"
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

        <div className="mt-4 text-center">
          <span className="text-[11px] text-slate-500">Powered by </span>
          <span className="text-[11px] font-bold text-sky-700">SecondMedic</span>
        </div>
      </div>
    </div>
  );
};
