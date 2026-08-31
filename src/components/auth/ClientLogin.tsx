import React, { useState } from 'react';
import { UserAuth } from '../../types';
import { Building2, Mail, Lock, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { StorageService } from '../../services/storage';
import { auth, signInWithEmailAndPassword } from '../../services/firebase';

interface ClientLoginProps {
  onLoginSuccess: (user: UserAuth) => void;
  onBackToLanding?: () => void;
}

export const ClientLogin: React.FC<ClientLoginProps> = ({ onLoginSuccess, onBackToLanding }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanInput = email.trim();

    if (!cleanInput) {
      setError('Please enter a valid laboratory / hospital contact email or phone.');
      return;
    }

    if (!password) {
      setError('Please enter your portal password.');
      return;
    }

    setLoading(true);

    try {
      const clients = StorageService.getClients();
      const cleanPhone = cleanInput.replace(/\D/g, '');
      const lowerIdent = cleanInput.toLowerCase();

      // Dynamic Client Lookup by email or phone
      const matchedClient = clients.find((c) => {
        const cPhone = c.phone.replace(/\D/g, '');
        return (
          c.email?.toLowerCase() === lowerIdent ||
          (cleanPhone.length >= 6 && cPhone.includes(cleanPhone)) ||
          c.id.toLowerCase() === lowerIdent
        );
      });

      // Status check
      if (matchedClient && matchedClient.status === 'inactive') {
        setError('Account inactive or suspended. Contact SecondMedic Dispatch.');
        setLoading(false);
        return;
      }

      // Lockout check
      if (matchedClient && matchedClient.lockoutUntil) {
        const lockoutTime = new Date(matchedClient.lockoutUntil).getTime();
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

      let isAuthenticated = false;
      const emailToAuth = matchedClient?.email || (cleanInput.includes('@') ? cleanInput : `${cleanPhone || 'client'}@vialtrack.in`);

      try {
        const userCredential = await signInWithEmailAndPassword(auth, emailToAuth, password);
        if (userCredential && userCredential.user) {
          isAuthenticated = true;
        }
      } catch (fbErr: any) {
        if (matchedClient?.password && matchedClient.password === password) {
          isAuthenticated = true;
        }
      }

      if (!isAuthenticated) {
        if (matchedClient) {
          const { attempts, isLocked } = StorageService.recordClientFailedAttempt(matchedClient.id);
          if (isLocked) {
            setError('Account temporarily locked due to 5 failed attempts. Please retry in 3 minutes.');
          } else {
            const remaining = 5 - attempts;
            setError(
              remaining > 0
                ? `Invalid email or password. Please try again. (${remaining} attempts remaining before temporary lockout)`
                : 'Invalid email or password. Please try again.'
            );
          }
        } else {
          setError('Invalid email or password. Please try again.');
        }
        setLoading(false);
        return;
      }

      // Successful login -> Reset failed attempts
      if (matchedClient) {
        StorageService.resetClientFailedAttempts(matchedClient.id);
      }

      const user: UserAuth = {
        id: `user-${matchedClient?.id || 'client-apex'}`,
        email: emailToAuth,
        name: matchedClient?.name || 'Metropolis Healthcare (Lab Ops)',
        role: 'client',
        clientId: matchedClient?.id || 'client-bkc-metropolis',
        phone: matchedClient?.phone || '+91 98200 11223',
        mustChangePassword: matchedClient?.mustChangePassword ?? false
      };

      onLoginSuccess(user);
    } catch (authError: any) {
      console.warn('[ClientLogin] Authentication failed:', authError?.code || authError?.message);
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs relative">
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
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">VialTrack — Client Portal</h2>
          <p className="text-xs text-slate-500 mt-1">
            Diagnostic Lab & Hospital Specimen Intake Tracking
          </p>
          <div className="mt-2 inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
            <span>Hospital & Diagnostic Lab Partner Portal</span>
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
              Laboratory / Hospital Email or Phone
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                placeholder="ops@yourlab.com or +91 98200 11223"
                className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all font-mono"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              Enter the credentials registered with SecondMedic Ops
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Password
              </label>
              <button
                type="button"
                className="text-[11px] text-emerald-700 hover:underline cursor-pointer"
                onClick={() => alert('Password reset instructions sent to your lab administrator.')}
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Enter password"
                className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1.5 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign in to Lab Dashboard'}
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
