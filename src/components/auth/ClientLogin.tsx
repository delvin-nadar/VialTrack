import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, KeyRound, AlertCircle, ArrowRight, ArrowLeft, ShieldCheck, Mail, RefreshCw } from 'lucide-react';
import { StorageService } from '../../services/storage';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { UserAuth } from '../../types';

interface ClientLoginProps {
  onLoginSuccess?: (user: UserAuth) => void;
  onBackToLanding?: () => void;
}

export const ClientLogin: React.FC<ClientLoginProps> = ({ onLoginSuccess, onBackToLanding }) => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const cleanInput = identifier.trim().toLowerCase();
    const cleanPass = password.trim();

    try {
      // 1. Check local storage first
      const localClients = StorageService.getClients();
      let matchedClient = localClients.find(
        (c) =>
          (c.email && c.email.toLowerCase().trim() === cleanInput) ||
          (c.phone && c.phone.replace(/\D/g, '') === cleanInput.replace(/\D/g, '')) ||
          (c.id && c.id.toLowerCase() === cleanInput)
      );

      // 2. Query Firestore directly if not matched locally
      if (!matchedClient) {
        const clientsRef = collection(db, 'clients');
        const snap = await getDocs(clientsRef);
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

        matchedClient = docs.find(
          (c) =>
            (c.email && c.email.toLowerCase().trim() === cleanInput) ||
            (c.phone && c.phone.replace(/\D/g, '') === cleanInput.replace(/\D/g, '')) ||
            (c.id && c.id.toLowerCase() === cleanInput)
        );
      }

      if (!matchedClient) {
        setError('No diagnostic client account found matching this email or phone.');
        setIsLoading(false);
        return;
      }

      // 3. Verify password strictly
      const validPass = matchedClient.password;
      if (validPass && cleanPass !== validPass) {
        setError('Invalid password. Please verify credentials or contact operations lead.');
        setIsLoading(false);
        return;
      }

      // 4. Save clean session and navigate to dashboard
      const clientSession = {
        role: 'client' as const,
        clientId: matchedClient.id,
        name: matchedClient.name,
        email: matchedClient.email || `${matchedClient.id}@vialtrack.in`,
        phone: matchedClient.phone || '',
        token: `token_client_${Date.now()}`,
        loginTimestamp: new Date().toISOString()
      };

      StorageService.setClientSession(clientSession);

      const user: UserAuth = {
        id: `user-${clientSession.clientId}`,
        email: clientSession.email,
        name: clientSession.name,
        role: 'client',
        clientId: clientSession.clientId,
        phone: clientSession.phone,
        mustChangePassword: false
      };

      if (onLoginSuccess) {
        onLoginSuccess(user);
      }

      navigate('/client');
    } catch (err: any) {
      console.error('Client login error:', err);
      setError('Connection to database failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden p-6 sm:p-8 space-y-6">
        {onBackToLanding && (
          <button
            type="button"
            onClick={onBackToLanding}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Portal Selection</span>
          </button>
        )}

        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 mb-1">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Client Diagnostic Portal</h1>
          <p className="text-xs text-slate-500">
            Hospital & Diagnostic Lab Partner Specimen Intake
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[10px] font-bold border border-teal-200">
            <ShieldCheck className="w-3 h-3" />
            <span>Verified Diagnostic Centers & Hospital Partners</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
              Laboratory / Hospital Email or Phone
            </label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="ops@lifecarediagnostics.com or phone"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-teal-600 shadow-2xs"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Enter the credentials registered with SecondMedic Ops
            </p>
          </div>

          <div>
            <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-teal-600 shadow-2xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 disabled:bg-teal-400 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in to Lab Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};