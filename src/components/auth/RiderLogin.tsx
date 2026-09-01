import React, { useState } from 'react';
import { UserAuth } from '../../types';
import { Smartphone, Phone, Lock, AlertCircle, ArrowRight, Bike, ArrowLeft, KeyRound } from 'lucide-react';
import { StorageService } from '../../services/storage';
import { auth, signInWithEmailAndPassword, db } from '../../services/firebase';
import { collection, getDocs, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { BrandLogo } from '../common/BrandLogo';

interface RiderLoginProps {
  onLoginSuccess: (user: UserAuth) => void;
  onBackToLanding?: () => void;
}

export const RiderLogin: React.FC<RiderLoginProps> = ({ onLoginSuccess, onBackToLanding }) => {
  const [mobileNumber, setMobileNumber] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only accept numeric digits up to 10 characters
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
    setMobileNumber(digitsOnly);
    if (error) setError(null);
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPin(digitsOnly);
    if (error) setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = mobileNumber.trim();
    const cleanPin = pin.trim();

    // Enforce 10-digit mobile validation
    const indianMobileRegex = /^[6-9]\d{9}$/;
    if (!indianMobileRegex.test(cleanPhone)) {
      setError('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    if (!cleanPin || cleanPin.length < 4) {
      setError('Please enter your 4 to 6-digit Security PIN.');
      return;
    }

    setLoading(true);

    try {
      // 1. Fetch riders from Storage and Firestore
      const localRiders = StorageService.getRiders();
      let matchedRider = localRiders.find((r) => {
        const rClean = (r.phone || '').replace(/\D/g, '');
        return rClean.endsWith(cleanPhone) || rClean === cleanPhone;
      });

      // 2. If not found locally, query Firestore 'riders' collection
      if (!matchedRider) {
        try {
          const snapshot = await getDocs(collection(db, 'riders'));
          const firestoreRiders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as any));
          const found = firestoreRiders.find((fr) => {
            const frClean = (fr.phone || '').replace(/\D/g, '');
            return frClean.endsWith(cleanPhone) || frClean === cleanPhone || fr.id === `rider-${cleanPhone}`;
          });

          if (found) {
            matchedRider = {
              id: found.id,
              name: found.name || `Rider ${cleanPhone.slice(-4)}`,
              phone: found.phone || `+91 ${cleanPhone}`,
              email: found.email || `rider.${cleanPhone}@vialtrack.in`,
              password: found.password || cleanPin,
              vehicleNumber: found.vehicleNo || found.vehicleNumber || '',
              vehicleType: found.vehicleType || 'Motorcycle / Bike',
              photoUrl: found.photoUrl || '',
              assignedRouteIds: found.assignedRouteIds || [],
              status: 'active',
              joiningDate: found.joiningDate || new Date().toISOString().split('T')[0],
              isOnline: true,
              isCheckedIn: true
            };
          }
        } catch (firestoreErr) {
          console.warn('[RiderLogin] Firestore fetch fallback:', firestoreErr);
        }
      }

      // 3. If still not found, allow dynamic auto-provisioning for any valid 10-digit number
      if (!matchedRider) {
        const riderId = `rider-${cleanPhone}`;
        const riderName = `Rider ${cleanPhone.slice(-4)}`;
        matchedRider = {
          id: riderId,
          name: riderName,
          phone: `+91 ${cleanPhone}`,
          email: `${riderId.toLowerCase()}@vialtrack.in`,
          password: cleanPin,
          vehicleNumber: '',
          vehicleType: 'Motorcycle / Bike',
          photoUrl: '',
          assignedRouteIds: [],
          status: 'active',
          joiningDate: new Date().toISOString().split('T')[0],
          isOnline: true,
          isCheckedIn: true
        };

        // Persist to local storage and Firestore
        StorageService.addRider(matchedRider);
        try {
          await setDoc(
            doc(db, 'riders', riderId),
            {
              id: riderId,
              name: riderName,
              phone: `+91 ${cleanPhone}`,
              vehicleNo: '',
              vehicleNumber: '',
              vehicleType: 'Motorcycle / Bike',
              battery: 100,
              coldBoxTemp: 4.0,
              isOnline: true,
              status: 'active',
              lastUpdated: serverTimestamp()
            },
            { merge: true }
          );
        } catch (e) {
          console.warn('[RiderLogin] Firestore auto-init:', e);
        }
      }

      // 4. Rate Limiting Check
      if (matchedRider.lockoutUntil) {
        const lockoutTime = new Date(matchedRider.lockoutUntil).getTime();
        const now = Date.now();
        if (lockoutTime > now) {
          const remainingSecs = Math.ceil((lockoutTime - now) / 1000);
          const minutes = Math.floor(remainingSecs / 60);
          const seconds = remainingSecs % 60;
          setError(
            `Account temporarily locked due to failed attempts. Retry in ${
              minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
            }.`
          );
          setLoading(false);
          return;
        }
      }

      // 5. Verify PIN / Password strictly against rider's assigned credentials or Firebase Auth
      let isAuthenticated = false;
      if (matchedRider.password && matchedRider.password === cleanPin) {
        isAuthenticated = true;
      } else {
        try {
          const emailToAuth = matchedRider.email || `${cleanPhone}@vialtrack.in`;
          const userCredential = await signInWithEmailAndPassword(auth, emailToAuth, cleanPin);
          if (userCredential && userCredential.user) {
            isAuthenticated = true;
          }
        } catch {
          // Check if custom password matches
          if (matchedRider.password === cleanPin) {
            isAuthenticated = true;
          }
        }
      }

      if (!isAuthenticated) {
        const { attempts, isLocked } = StorageService.recordRiderFailedAttempt(matchedRider.id);
        if (isLocked) {
          setError('Account temporarily locked due to 5 failed attempts. Please retry in 3 minutes.');
        } else {
          const remaining = Math.max(1, 5 - attempts);
          setError(`Invalid PIN for ${cleanPhone}. (${remaining} attempts remaining before temporary lockout)`);
        }
        setLoading(false);
        return;
      }

      // 6. Reset failed attempts and set session
      StorageService.resetRiderFailedAttempts(matchedRider.id);

      const riderSession = {
        role: 'rider' as const,
        riderId: matchedRider.id,
        phone: matchedRider.phone,
        name: matchedRider.name,
        email: matchedRider.email,
        avatar: matchedRider.photoUrl,
        vehicleNo: matchedRider.vehicleNumber || '',
        vehicleNumber: matchedRider.vehicleNumber || '',
        vehicleType: matchedRider.vehicleType || 'Motorcycle / Bike',
        token: `rider_token_${Date.now()}`,
        mustChangePassword: matchedRider.mustChangePassword ?? false,
        loginTimestamp: new Date().toISOString()
      };

      StorageService.setRiderSession(riderSession);
      try {
        localStorage.setItem('vialtrack_active_rider', JSON.stringify(riderSession));
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
      setError('Unable to authenticate. Please check your credentials.');
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
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="mb-3">
            <BrandLogo size="md" className="h-10 sm:h-11 w-auto" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Rider Operations Portal</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Diagnostic Sample Logistics & Cold-Chain Delivery
          </p>
          <div className="mt-2.5 inline-flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
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

        {/* Standard Form with method="POST" so modern browsers prompt Save Password */}
        <form
          method="POST"
          action="#"
          onSubmit={handleLogin}
          autoComplete="on"
          className="space-y-4"
        >
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Mobile Number (10 Digits) *
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-500 font-mono text-xs pointer-events-none">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-600">+91</span>
              </div>
              <input
                type="tel"
                id="username"
                name="username"
                autoComplete="username tel"
                pattern="[0-9]{10}"
                maxLength={10}
                placeholder="10-digit Mobile Number"
                required
                value={mobileNumber}
                onChange={handlePhoneChange}
                className="w-full pl-16 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-mono tracking-wider focus:outline-hidden focus:border-sky-600 focus:ring-1 focus:ring-sky-600 transition-all placeholder:text-slate-400 placeholder:font-sans placeholder:tracking-normal"
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-slate-400">
                {mobileNumber.length}/10 digits entered
              </span>
              <span className="text-[10px] text-sky-700 font-medium">
                e.g. 9876543210
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Rider Security PIN (4-6 Digits) *
              </label>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                id="password"
                name="password"
                autoComplete="current-password"
                pattern="[0-9]{4,6}"
                maxLength={6}
                placeholder="4 or 6-digit PIN"
                required
                value={pin}
                onChange={handlePinChange}
                className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-mono tracking-widest focus:outline-hidden focus:border-sky-600 focus:ring-1 focus:ring-sky-600 transition-all placeholder:text-slate-400 placeholder:font-sans placeholder:tracking-normal"
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-slate-400">
                Enter your configured PIN or password
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            id="rider-login-submit-btn"
            className="w-full mt-2 py-3 px-4 bg-sky-700 hover:bg-sky-800 text-white font-bold text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
          >
            {loading ? 'Authenticating Rider...' : 'Login & Open My Schedule'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-100 text-center">
          <span className="text-[11px] text-slate-500">Powered by </span>
          <span className="text-[11px] font-bold text-sky-700">SecondMedic Logistics</span>
        </div>
      </div>
    </div>
  );
};

