import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client, Route, RouteStop } from '../../types';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Clock,
  Phone,
  Mail,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Save,
  ShieldCheck,
  Search,
  KeyRound,
  RefreshCw,
  Copy,
  AlertCircle,
  Eye
} from 'lucide-react';
import { StorageService } from '../../services/storage';
import { db } from '../../services/firebase';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { generateStrongPassword, formatCredentialsMessage, copyTextToClipboard } from '../../utils/security';
import { normalizeLatLng } from '../../utils/coordinates';
import { RouteStopsManager } from './RouteStopsManager';
import { AddRouteModal } from './AddRouteModal';

interface ManageClientsProps {
  clients: Client[];
  routes: Route[];
  onRefresh: () => void;
}

export const ManageClients: React.FC<ManageClientsProps> = ({ clients, routes, onRefresh }) => {
  const navigate = useNavigate();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(clients[0]?.id || null);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [isAddingRoute, setIsAddingRoute] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdCredentialsModal, setCreatedCredentialsModal] = useState<{
    name: string;
    loginId: string;
    password: string;
    portalUrl: string;
  } | null>(null);

  const [clientForm, setClientForm] = useState<Partial<Client> & { password?: string }>({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    password: '',
    address: '',
    lat: '' as any,
    lng: '' as any,
    active: true,
    billingRatePerPickup: '' as any
  });

  const [routeForm, setRouteForm] = useState<{
    name: string;
    description: string;
    destinationName: string;
    destinationAddress: string;
    destinationLat: number | string;
    destinationLng: number | string;
    destinationContact: string;
    destinationPhone: string;
    stops: RouteStop[];
    timeSlots: string[];
    newTimeSlotInput: string;
  }>({
    name: '',
    description: '',
    destinationName: '',
    destinationAddress: '',
    destinationLat: '',
    destinationLng: '',
    destinationContact: '',
    destinationPhone: '',
    stops: [],
    timeSlots: [],
    newTimeSlotInput: ''
  });

  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contactPerson?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedClient = clients.find((c) => c.id === selectedClientId) || filteredClients[0] || clients[0];
  const clientRoutes = routes.filter((r) => r.clientId === selectedClient?.id);

  const handleGeneratePassword = () => {
    const strong = generateStrongPassword(9);
    setClientForm((prev) => ({ ...prev, password: strong }));
    setFormError(null);
  };

  const handleCopyClientCredentials = async (loginId: string, tempPassword: string) => {
    const text = formatCredentialsMessage({
      portalUrl: `${window.location.origin}/#/client`,
      loginId,
      tempPassword
    });
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!clientForm.name?.trim()) {
      setFormError('Diagnostic Lab / Clinic Name is required.');
      return;
    }
    if (!clientForm.phone?.trim() && !clientForm.email?.trim()) {
      setFormError('Phone number or Email (Login ID) is required.');
      return;
    }

    if (clientForm.password && clientForm.password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    const effectivePassword = clientForm.password || (selectedClient?.password ? selectedClient.password : generateStrongPassword(9));
    const effectivePhone = clientForm.phone?.trim() || '';
    const effectiveEmail = clientForm.email?.trim() || '';

    if (isEditingClient && selectedClient) {
      const [vLat, vLng] = normalizeLatLng(clientForm.lat, clientForm.lng, selectedClient.lat || 19.1287852, selectedClient.lng || 72.8294183);
      const updated: Client = {
        ...selectedClient,
        name: clientForm.name.trim(),
        contactPerson: clientForm.contactPerson?.trim() || selectedClient.contactPerson,
        phone: effectivePhone,
        email: effectiveEmail,
        password: effectivePassword,
        role: 'client',
        status: clientForm.active ? 'active' : 'inactive',
        address: clientForm.address?.trim() || selectedClient.address,
        lat: Number(vLat),
        lng: Number(vLng),
        billingRatePerPickup: Number(clientForm.billingRatePerPickup) || 0,
        active: clientForm.active ?? true,
        mustChangePassword: selectedClient.mustChangePassword ?? false,
        failedAttempts: selectedClient.failedAttempts ?? 0
      };
      StorageService.updateClient(updated);
      try {
        await setDoc(doc(db, 'clients', updated.id), JSON.parse(JSON.stringify(updated)), { merge: true });
      } catch (err: any) {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
          console.warn('Firestore quota exceeded; updated client locally.');
        } else {
          console.error("Firestore Write Error:", err);
        }
      }
    } else {
      const [vLat, vLng] = normalizeLatLng(clientForm.lat, clientForm.lng, 19.1287852, 72.8294183);
      const newClient: Client = {
        id: `client-${Date.now()}`,
        name: clientForm.name.trim(),
        contactPerson: clientForm.contactPerson?.trim() || '',
        phone: effectivePhone,
        email: effectiveEmail,
        password: effectivePassword,
        role: 'client',
        status: 'active',
        address: clientForm.address?.trim() || '',
        lat: Number(vLat),
        lng: Number(vLng),
        active: true,
        mustChangePassword: true,
        failedAttempts: 0,
        createdAt: new Date().toISOString(),
        billingRatePerPickup: Number(clientForm.billingRatePerPickup) || 0
      };
      StorageService.addClient(newClient);
      try {
        await setDoc(doc(db, 'clients', newClient.id), JSON.parse(JSON.stringify(newClient)), { merge: true });
      } catch (err: any) {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
          console.warn('Firestore quota exceeded; client created locally.');
        } else {
          console.error("Firestore Write Error:", err);
        }
      }
      setSelectedClientId(newClient.id);

      setCreatedCredentialsModal({
        name: newClient.name,
        loginId: newClient.phone || newClient.email,
        password: effectivePassword,
        portalUrl: `${window.location.origin}/#/client`
      });
    }

    setIsAddingClient(false);
    setIsEditingClient(false);
    onRefresh();
  };

  const handleDeleteClient = async (clientId: string, clientName: string) => {
    if (window.confirm(`Are you sure you want to remove ${clientName}? This will also remove associated routes.`)) {
      StorageService.deleteClient(clientId);
      try {
        await deleteDoc(doc(db, 'clients', clientId));
      } catch (err) {
        console.error("Firestore Write Error:", err);
      }
      const remaining = clients.filter((c) => c.id !== clientId);
      if (remaining.length > 0) {
        setSelectedClientId(remaining[0].id);
      } else {
        setSelectedClientId(null);
      }
      onRefresh();
    }
  };

  const handleDeleteRoute = async (routeId: string, routeName: string) => {
    if (window.confirm(`Are you sure you want to delete route "${routeName}"?`)) {
      StorageService.deleteRoute(routeId);
      try {
        await deleteDoc(doc(db, 'routes', routeId));
      } catch (err) {
        console.error("Firestore Write Error:", err);
      }
      onRefresh();
    }
  };

  const handleSaveRoute = async (newRoute: Route) => {
    try {
      await setDoc(doc(db, 'routes', newRoute.id), JSON.parse(JSON.stringify(newRoute)));

      const taskId = `task_${Date.now()}`;
      const taskDoc = {
        id: taskId,
        taskId: taskId,
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        clientEmail: selectedClient.email || '',
        routeId: newRoute.id,
        routeName: newRoute.name,
        riderId: '',
        riderName: 'Unassigned',
        riderPhone: '',
        status: 'pending' as const,
        currentStopIndex: 0,
        stops: newRoute.stops.map((stop, index) => ({
          id: stop.id,
          stopIndex: index + 1,
          name: stop.name,
          address: stop.address || '',
          lat: Number(stop.lat),
          lng: Number(stop.lng),
          status: index === 0 ? ('in_progress' as const) : ('pending' as const)
        })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'tasks', taskId), taskDoc, { merge: true });
      console.log('[CloudSync] Auto-instantiated tasks/' + taskId);
    } catch (err: any) {
      console.error('Firestore Write Error:', err);
    } finally {
      setIsAddingRoute(false);
      onRefresh();
    }
  };

  const handlePreviewAsClient = (client: Client) => {
    const clientSession = {
      role: 'client' as const,
      clientId: client.id,
      name: client.name,
      email: client.email || `${client.id}@vialtrack.in`,
      phone: client.phone,
      token: `token_preview_${Date.now()}`,
      isPreview: true,
      loginTimestamp: new Date().toISOString()
    };
    StorageService.setClientSession(clientSession);
    window.open('/#/client', '_blank');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-4 sm:p-5 rounded-xl shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-sky-700" />
            <span>Manage Diagnostic Clients & Routes</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Register hospital & lab accounts, manage collection routes, and configure pickup schedules.
          </p>
        </div>

        <button
          onClick={() => {
            setClientForm({
              name: '',
              contactPerson: '',
              phone: '',
              email: '',
              address: '',
              lat: 19.1287852,
              lng: 72.8294183,
              active: true,
              billingRatePerPickup: 0
            });
            setIsAddingClient(true);
            setIsEditingClient(false);
          }}
          className="px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Client</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Diagnostic Clients ({clients.length})
            </h3>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-sky-600 shadow-2xs"
            />
          </div>

          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-0.5">
            {filteredClients.length === 0 ? (
              <div className="p-6 text-center bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                No clients match your search.
              </div>
            ) : (
              filteredClients.map((client) => {
                const isSelected = selectedClient?.id === client.id;
                const rCount = routes.filter((r) => r.clientId === client.id).length;

                return (
                  <div
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50/70 border-sky-600 shadow-xs ring-1 ring-sky-600/30'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{client.name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{client.contactPerson}</p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          client.active
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {client.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-[11px]">
                        <MapPin className="w-3 h-3 text-sky-700" /> {rCount} Route(s)
                      </span>
                      <span className="font-mono font-semibold text-slate-800 text-[11px]">₹{client.billingRatePerPickup || 0}/pickup</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-4">
          {selectedClient ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-bold text-slate-900">{selectedClient.name}</h3>
                    <span className="bg-sky-50 text-sky-700 border border-sky-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      Client ID: {selectedClient.id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedClient.address}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handlePreviewAsClient(selectedClient)}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg transition-colors border border-emerald-300 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Open live client dashboard for this hospital/lab in isolated preview mode"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Preview as Client</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyClientCredentials(selectedClient.phone || selectedClient.email, selectedClient.password || '')}
                    className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold rounded-lg transition-colors border border-sky-200 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Copy formatted credentials text to clipboard"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copySuccess ? 'Copied!' : 'Copy Credentials'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setClientForm({
                        ...selectedClient,
                        password: selectedClient.password || ''
                      });
                      setIsEditingClient(true);
                      setIsAddingClient(false);
                      setFormError(null);
                    }}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-sky-700" />
                    <span>Edit Info</span>
                  </button>
                  <button
                    onClick={() => handleDeleteClient(selectedClient.id, selectedClient.name)}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg transition-colors border border-rose-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingRoute(true);
                      setRouteForm({
                        name: '',
                        description: '',
                        destinationName: selectedClient.name,
                        destinationAddress: selectedClient.address,
                        destinationLat: selectedClient.lat || 19.1287852,
                        destinationLng: selectedClient.lng || 72.8294183,
                        destinationContact: selectedClient.contactPerson || '',
                        destinationPhone: selectedClient.phone || '',
                        stops: [],
                        timeSlots: [],
                        newTimeSlotInput: ''
                      });
                    }}
                    className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Route</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Primary Contact:</span>
                  <span className="font-semibold text-slate-800">{selectedClient.contactPerson || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Portal Login Email:</span>
                  <span className="font-mono text-sky-700 font-semibold">{selectedClient.email || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Direct Phone:</span>
                  <span className="font-mono text-slate-700">{selectedClient.phone || '—'}</span>
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-sky-700" />
                    <span>Configured Collection Routes ({clientRoutes.length})</span>
                  </h4>
                </div>

                {clientRoutes.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400 text-xs">
                    No routes created yet for this client. Click "Add Route" above.
                  </div>
                ) : (
                  clientRoutes.map((route) => (
                    <RouteStopsManager
                      key={route.id}
                      route={route}
                      onRouteUpdated={() => onRefresh()}
                      onDeleteRoute={handleDeleteRoute}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl text-slate-400 text-sm">
              Select or register a client to view details.
            </div>
          )}
        </div>
      </div>

      {(isAddingClient || isEditingClient) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-700" />
                <span>{isEditingClient ? 'Edit Diagnostic Client' : 'Register Diagnostic Client'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsAddingClient(false);
                  setIsEditingClient(false);
                }}
                className="p-1 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveClient} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Diagnostic Lab / Hospital Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lifecare Diagnostics"
                  value={clientForm.name || ''}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-sky-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Jayesh Joshi"
                    value={clientForm.contactPerson || ''}
                    onChange={(e) => setClientForm({ ...clientForm, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Contact Phone / Login ID *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9096970015"
                    value={clientForm.phone || ''}
                    onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Client Portal Login Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. jayesh.joshi@lifecarediagnostics.com"
                  value={clientForm.email || ''}
                  onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  The client will use this email or phone number to log in to their dashboard.
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-700 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-sky-700" />
                    <span>Password / Access Key {isAddingClient && '*'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[11px] text-sky-700 hover:text-sky-800 font-bold flex items-center gap-1 cursor-pointer bg-white px-2 py-0.5 rounded-md border border-sky-200"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Generate Strong Password
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={isEditingClient ? 'Leave blank to keep existing password' : 'Min 8 chars alphanumeric + symbols'}
                    value={clientForm.password || ''}
                    onChange={(e) => setClientForm({ ...clientForm, password: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:outline-hidden focus:border-sky-600"
                  />
                  {clientForm.password && (
                    <button
                      type="button"
                      onClick={() => handleCopyClientCredentials(clientForm.phone || clientForm.email || '', clientForm.password || '')}
                      className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold text-xs shrink-0 flex items-center gap-1 cursor-pointer"
                      title="Copy credentials text"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">
                  Must be at least 8 characters. On first login, clients will be prompted to set their permanent password.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Central Lab Full Address
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Cosmos Plaza, 206, D.N.Nagar, Andheri West, Mumbai 400053"
                  value={clientForm.address || ''}
                  onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-sky-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="19.1287852"
                    value={clientForm.lat ?? ''}
                    onChange={(e) => setClientForm({ ...clientForm, lat: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="72.8294183"
                    value={clientForm.lng ?? ''}
                    onChange={(e) => setClientForm({ ...clientForm, lng: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Rate per Pickup Round (₹)
                  </label>
                  <input
                    type="number"
                    value={clientForm.billingRatePerPickup || ''}
                    placeholder="e.g. 130"
                    onChange={(e) => setClientForm({ ...clientForm, billingRatePerPickup: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-800">
                    <input
                      type="checkbox"
                      checked={clientForm.active ?? true}
                      onChange={(e) => setClientForm({ ...clientForm, active: e.target.checked })}
                      className="rounded border-slate-300 text-sky-700 focus:ring-sky-600 w-4 h-4"
                    />
                    <span className="font-bold text-xs">Active Account</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingClient(false);
                    setIsEditingClient(false);
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold transition-all shadow-xs cursor-pointer"
                >
                  {isEditingClient ? 'Update Client' : 'Save Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createdCredentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Client Account Created</span>
              </h3>
              <button
                onClick={() => setCreatedCredentialsModal(null)}
                className="p-1 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Diagnostic Client <strong className="text-slate-900">{createdCredentialsModal.name}</strong> has been registered. Share these credentials with the client admin:
            </p>

            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs text-slate-800 space-y-1.5 whitespace-pre-wrap select-all">
              {formatCredentialsMessage({
                portalUrl: createdCredentialsModal.portalUrl,
                loginId: createdCredentialsModal.loginId,
                tempPassword: createdCredentialsModal.password
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  handleCopyClientCredentials(createdCredentialsModal.loginId, createdCredentialsModal.password);
                }}
                className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold text-xs flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>{copySuccess ? 'Copied to Clipboard!' : 'Copy Credentials Message'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedCredentialsModal(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddingRoute && selectedClient && (
        <AddRouteModal
          isOpen={isAddingRoute}
          onClose={() => setIsAddingRoute(false)}
          client={selectedClient}
          onSaveRoute={handleSaveRoute}
        />
      )}
    </div>
  );
};