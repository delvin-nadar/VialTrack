import React, { useState } from 'react';
import { UserAuth } from '../../types';
import { Smartphone, Phone, Lock, AlertCircle, ArrowRight, Bike, ArrowLeft, ShieldAlert, Clock } from 'lucide-react';
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

    const cleanIdentifier = identifier.trim();

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
      const lowerIdent = cleanIdentifier.toLowerCase();

      // 1. Dynamic Rider Lookup by phone or email
      const matchedRider = riders.find((r) => {
        const rCleanPhone = r.phone.replace(/\D/g, '');
        return (
          r.email.toLowerCase() === lowerIdent ||
          (cleanPhone.length >= 6 && rCleanPhone.includes(cleanPhone)) ||
          r.id.toLowerCase() === lowerIdent ||
          r.phone.toLowerCase() === lowerIdent
        );
      });

      if (!matchedRider) {
        setError('Invalid phone number or password. Please try again.');
        setLoading(false);
        return;
      }

      // 2. Account Status Verification: check if inactive or suspended
      if (matchedRider.status === 'inactive' || (matchedRider.status as string) === 'suspended') {
        setError('Account inactive or suspended. Contact SecondMedic Dispatch.');
        setLoading(false);
        return;
      }

      // 3. Rate Limiting / Lockout Check (5 consecutive failed attempts = 3-minute lockout)
      if (matchedRider.lockoutUntil) {
        const lockoutTime = new Date(matchedRider.lockoutUntil).getTime();
        const now = Date.now();
        if (lockoutTime > now) {
          const remainingSecs = Math.ceil((lockoutTime - now) / 1000);
          const minutes = Math.floor(remainingSecs / 60);
          const seconds = remainingSecs % 60;
          setError(
            `Account temporarily locked due to 5 failed attempts. Please retry in ${
              minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
            }.`
          );
          setLoading(false);
          return;
        }
      }

      // 4. Authenticate via Firebase Authentication or strict password verification
      let isAuthenticated = false;
      const emailToAuth = matchedRider.email || `${cleanPhone || 'rider'}@vialtrack.in`;

      try {
        const userCredential = await signInWithEmailAndPassword(auth, emailToAuth, pin);
        if (userCredential && userCredential.user) {
          isAuthenticated = true;
        }
      } catch (fbErr: any) {
        // Check if password matches the rider document password (for newly created or modified riders)
        if (matchedRider.password && matchedRider.password === pin) {
          isAuthenticated = true;
        }
      }

      if (!isAuthenticated) {
        // Record failed attempt & evaluate rate limit
        const { attempts, isLocked, lockoutUntil } = StorageService.recordRiderFailedAttempt(matchedRider.id);
        if (isLocked) {
          setError('Account temporarily locked due to 5 failed attempts. Please retry in 3 minutes.');
        } else {
          const remaining = 5 - attempts;
          setError(
            remaining > 0
              ? `Invalid phone number or password. Please try again. (${remaining} attempts remaining before temporary lockout)`
              : 'Invalid phone number or password. Please try again.'
          );
        }
        setLoading(false);
        return;
      }

      // 5. Authentication Successful -> Reset failed attempts
      StorageService.resetRiderFailedAttempts(matchedRider.id);

      const riderSession = {
        role: 'rider' as const,
        riderId: matchedRider.id,
        phone: matchedRider.phone,
        name: matchedRider.name,
        email: matchedRider.email,
        avatar: matchedRider.photoUrl,
        token: `rider_token_${Date.now()}`,
        mustChangePassword: matchedRider.mustChangePassword ?? false,
        loginTimestamp: new Date().toISOString()
      };

      try {
        localStorage.setItem('vialtrack_rider_session', JSON.stringify(riderSession));
      } catch (err) {
        console.warn('Could not write rider session:', err);
      }

      const user: UserAuth = {
        id: `user-${riderSession.riderId}`,
        email: riderSession.email,
        name: riderSession.name,
        role: 'rider',
        riderId: riderSession.riderId,
        phone: riderSession.phone,
        avatar: riderSession.avatar,
        mustChangePassword: riderSession.mustChangePassword
      };

      onLoginSuccess(user);
    } catch (err: any) {
      console.warn('[RiderLogin] Login exception:', err);
      setError('Invalid phone number or password. Please try again.');
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
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2 animate-fadeIn">
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
            className="w-full mt-1.5 py-2.5 px-4 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
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
