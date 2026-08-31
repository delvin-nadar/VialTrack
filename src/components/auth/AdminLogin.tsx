import React, { useState } from 'react';
import { UserAuth } from '../../types';
import { ShieldCheck, Mail, Lock, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { signInDemoAccount } from '../../services/firebase';

interface AdminLoginProps {
  onLoginSuccess: (user: UserAuth) => void;
  onSwitchPortal?: (path: string) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('ops.lead@secondmedic.com');
  const [password, setPassword] = useState('••••••••••••');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Enforce @secondmedic.com domain requirement as strictly requested
    if (!email.toLowerCase().endsWith('@secondmedic.com')) {
      setError('Admin access restricted: You must use an authorized @secondmedic.com corporate email address.');
      return;
    }

    if (!password) {
      setError('Please enter your administrator password.');
      return;
    }

    setLoading(true);
    signInDemoAccount('admin')
      .catch((err) => console.warn('[AdminLogin] Firebase Auth notice:', err))
      .finally(() => {
        setLoading(false);
        const user: UserAuth = {
          id: 'admin-1',
          email: email.trim().toLowerCase(),
          name: 'Vikas Mehra (Ops Dispatch Lead)',
          role: 'admin',
          phone: '+91 98200 99887'
        };
        onLoginSuccess(user);
      });
  };

  const handleDemoFill = () => {
    setEmail('ops.lead@secondmedic.com');
    setPassword('Admin@SecondMedic2026');
    setError(null);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs relative">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">VialTrack — Admin Portal</h2>
          <p className="text-xs text-slate-500 mt-1">
            SecondMedic Diagnostic Operations & Dispatch Command
          </p>
          <div className="mt-2 inline-flex items-center gap-1 bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
            <span>Corporate Access (@secondmedic.com only)</span>
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
              SecondMedic Corporate Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@secondmedic.com"
                className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-sky-600 focus:ring-1 focus:ring-sky-600 transition-all font-mono"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              Must end with <strong className="text-slate-700 font-semibold">@secondmedic.com</strong>
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Password
              </label>
              <button
                type="button"
                className="text-[11px] text-sky-700 hover:underline cursor-pointer"
                onClick={() => alert('Password reset link sent to your registered @secondmedic.com mailbox.')}
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
                placeholder="Enter password"
                className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-sky-600 focus:ring-1 focus:ring-sky-600 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1.5 py-2.5 px-4 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Sign in to Admin Dashboard'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Fast Login */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleDemoFill}
            className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer shadow-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-700" />
            <span>Fill Ops Lead Credentials</span>
          </button>
        </div>
      </div>
    </div>
  );
};
