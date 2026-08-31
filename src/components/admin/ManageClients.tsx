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
  Eye,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { StorageService } from '../../services/storage';
import { generateStrongPassword, validatePasswordStrength, formatCredentialsMessage, copyTextToClipboard } from '../../utils/security';
import { normalizeLatLng } from '../../utils/coordinates';
import { RouteStopsManager } from './RouteStopsManager';

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

  // Client form state
  const [clientForm, setClientForm] = useState<Partial<Client> & { password?: string }>({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    password: '',
    address: '',
    lat: 19.1860,
    lng: 72.8485,
    active: true,
    billingRatePerPickup: 450
  });

  // Route form state
  const [routeForm, setRouteForm] = useState<{
    name: string;
    description: string;
    destinationName: string;
    destinationAddress: string;
    destinationLat: number;
    destinationLng: number;
    destinationContact: string;
    destinationPhone: string;
    stops: RouteStop[];
    timeSlots: string[];
    newTimeSlotInput: string;
  }>({
    name: '',
    description: '',
    destinationName: 'Central Processing Diagnostic Lab',
    destinationAddress: 'Main Diagnostic Hub, Link Road, Mumbai',
    destinationLat: 19.1860,
    destinationLng: 72.8485,
    destinationContact: 'Dr. Ramesh Patil',
    destinationPhone: '+91 98203 34567',
    stops: [
      {
        id: `stop-${Date.now()}-1`,
        name: 'Hospital Collection Center 1',
        address: 'MG Road, Kandivali West, Mumbai',
        lat: 19.2082,
        lng: 72.8398,
        contactPerson: 'Sister Sunita Rao',
        phone: '+91 98201 12345',
        order: 1
      }
    ],
    timeSlots: ['10:00', '14:00', '18:00', '22:00'],
    newTimeSlotInput: '08:30'
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
      portalUrl: 'https://delvin-nadar.github.io/VialTrack/#/client',
      loginId,
      tempPassword
    });
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  // Handle Save Client
  const handleSaveClient = (e: React.FormEvent) => {
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
    const effectivePhone = clientForm.phone?.trim() || '+91 98200 00000';
    const effectiveEmail = clientForm.email?.trim() || `lab.${clientForm.name.toLowerCase().replace(/\s+/g, '')}@vialtrack.in`;

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
        billingRatePerPickup: Number(clientForm.billingRatePerPickup) || 450,
        active: clientForm.active ?? true,
        mustChangePassword: selectedClient.mustChangePassword ?? false,
        failedAttempts: selectedClient.failedAttempts ?? 0
      };
      StorageService.updateClient(updated);
    } else {
      const [vLat, vLng] = normalizeLatLng(clientForm.lat, clientForm.lng, 19.1287852, 72.8294183);
      const newClient: Client = {
        id: `client-${Date.now()}`,
        name: clientForm.name.trim(),
        contactPerson: clientForm.contactPerson?.trim() || 'Laboratory Ops Lead',
        phone: effectivePhone,
        email: effectiveEmail,
        password: effectivePassword,
        role: 'client',
        status: 'active',
        address: clientForm.address?.trim() || 'Mumbai, Maharashtra',
        lat: Number(vLat),
        lng: Number(vLng),
        active: true,
        mustChangePassword: true,
        failedAttempts: 0,
        createdAt: new Date().toISOString(),
        billingRatePerPickup: Number(clientForm.billingRatePerPickup) || 450
      };
      StorageService.addClient(newClient);
      setSelectedClientId(newClient.id);

      setCreatedCredentialsModal({
        name: newClient.name,
        loginId: newClient.phone || newClient.email,
        password: effectivePassword,
        portalUrl: 'https://delvin-nadar.github.io/VialTrack/#/client'
      });
    }

    setIsAddingClient(false);
    setIsEditingClient(false);
    onRefresh();
  };

  // Handle Delete Client
  const handleDeleteClient = (clientId: string, clientName: string) => {
    if (window.confirm(`Are you sure you want to remove ${clientName}? This will also remove associated routes.`)) {
      StorageService.deleteClient(clientId);
      const remaining = clients.filter((c) => c.id !== clientId);
      if (remaining.length > 0) {
        setSelectedClientId(remaining[0].id);
      } else {
        setSelectedClientId(null);
      }
      onRefresh();
    }
  };

  // Handle Delete Route
  const handleDeleteRoute = (routeId: string, routeName: string) => {
    if (window.confirm(`Are you sure you want to delete route "${routeName}"?`)) {
      StorageService.deleteRoute(routeId);
      onRefresh();
    }
  };

  // Add a stop to current route form
  const handleAddStopToForm = () => {
    const newStop: RouteStop = {
      id: `stop-${Date.now()}-${routeForm.stops.length + 1}`,
      name: `Hospital Collection Center ${routeForm.stops.length + 1}`,
      address: 'Station Road, Western Suburbs, Mumbai',
      lat: 19.1624,
      lng: 72.8465,
      contactPerson: 'Collection Lead',
      phone: '+91 98202 00000',
      order: routeForm.stops.length + 1
    };
    setRouteForm({ ...routeForm, stops: [...routeForm.stops, newStop] });
  };

  // Remove a stop
  const handleRemoveStopFromForm = (stopId: string) => {
    setRouteForm({
      ...routeForm,
      stops: routeForm.stops.filter((s) => s.id !== stopId)
    });
  };

  // Move stop up or down in Add Route form
  const handleMoveStopInForm = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= routeForm.stops.length) return;
    const newStops = [...routeForm.stops];
    const [moved] = newStops.splice(index, 1);
    newStops.splice(targetIndex, 0, moved);
    setRouteForm({
      ...routeForm,
      stops: newStops.map((s, idx) => ({ ...s, order: idx + 1 }))
    });
  };

  // Add time slot
  const handleAddTimeSlot = () => {
    if (!routeForm.newTimeSlotInput) return;
    if (routeForm.timeSlots.includes(routeForm.newTimeSlotInput)) return;
    const sorted = [...routeForm.timeSlots, routeForm.newTimeSlotInput].sort();
    setRouteForm({ ...routeForm, timeSlots: sorted, newTimeSlotInput: '' });
  };

  // Remove time slot
  const handleRemoveTimeSlot = (slot: string) => {
    setRouteForm({
      ...routeForm,
      timeSlots: routeForm.timeSlots.filter((s) => s !== slot)
    });
  };

  // Save new Route
  const handleSaveRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !routeForm.name) return;

    const [dLat, dLng] = normalizeLatLng(
      routeForm.destinationLat || selectedClient.lat,
      routeForm.destinationLng || selectedClient.lng,
      19.1287852,
      72.8294183
    );

    const normalizedStops = routeForm.stops.map((s, idx) => {
      const [sLat, sLng] = normalizeLatLng(s.lat, s.lng, 19.1624, 72.8465);
      return {
        ...s,
        lat: Number(sLat),
        lng: Number(sLng),
        order: idx + 1
      };
    });

    const newRoute: Route = {
      id: `route-${Date.now()}`,
      clientId: selectedClient.id,
      name: routeForm.name,
      description: routeForm.description,
      destinationLab: {
        id: `dest-${Date.now()}`,
        name: routeForm.destinationName || selectedClient.name,
        address: routeForm.destinationAddress || selectedClient.address,
        lat: Number(dLat),
        lng: Number(dLng),
        contactPerson: routeForm.destinationContact || selectedClient.contactPerson,
        phone: routeForm.destinationPhone || selectedClient.phone
      },
      stops: normalizedStops,
      timeSlots: routeForm.timeSlots.length > 0 ? routeForm.timeSlots : ['10:00', '14:00', '18:00', '22:00'],
      active: true
    };

    StorageService.addRoute(newRoute);
    setIsAddingRoute(false);
    onRefresh();
  };

  // Preview as Client tool
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
    navigate('/client');
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Actions */}
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
              lat: 19.1860,
              lng: 72.8485,
              active: true,
              billingRatePerPickup: 450
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

      {/* Main Layout: Client List on Left, Client & Routes details on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Client List (4 Cols) */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Diagnostic Clients ({clients.length})
            </h3>
          </div>

          {/* Search bar */}
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
                      <span className="font-mono font-semibold text-slate-800 text-[11px]">₹{client.billingRatePerPickup || 450}/pickup</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Client Info & Configured Routes (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          {selectedClient ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
              {/* Selected Client Card Header */}
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
                    onClick={() => handleCopyClientCredentials(selectedClient.phone || selectedClient.email, selectedClient.password || 'SecondMedicOps@2026')}
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
                        name: `${selectedClient.name} - Loop ${clientRoutes.length + 1}`,
                        description: 'Specimen pickup loop',
                        destinationName: `${selectedClient.name} Processing Lab`,
                        destinationAddress: selectedClient.address,
                        destinationLat: selectedClient.lat || 19.1860,
                        destinationLng: selectedClient.lng || 72.8485,
                        destinationContact: selectedClient.contactPerson,
                        destinationPhone: selectedClient.phone,
                        stops: [
                          {
                            id: `stop-${Date.now()}-1`,
                            name: 'Hospital Collection Point A',
                            address: 'Link Road, Mumbai',
                            lat: 19.2082,
                            lng: 72.8398,
                            contactPerson: 'Pathology Coord',
                            phone: '+91 98201 00000',
                            order: 1
                          }
                        ],
                        timeSlots: ['09:00', '13:00', '17:00', '21:00'],
                        newTimeSlotInput: '11:30'
                      });
                    }}
                    className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Route</span>
                  </button>
                </div>
              </div>

              {/* Client Contacts grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Primary Contact:</span>
                  <span className="font-semibold text-slate-800">{selectedClient.contactPerson}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Portal Login Email:</span>
                  <span className="font-mono text-sky-700 font-semibold">{selectedClient.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Direct Phone:</span>
                  <span className="font-mono text-slate-700">{selectedClient.phone}</span>
                </div>
              </div>

              {/* Routes List for this client */}
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

      {/* Add / Edit Client Modal */}
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
                  placeholder="e.g. Apex Diagnostics Hub"
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
                    placeholder="e.g. Dr. Anita Desai"
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
                    placeholder="+91 98200 11223"
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
                  placeholder="ops@apexdiagnostics.in"
                  value={clientForm.email || ''}
                  onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  The client will use this email or phone number to log in to their dashboard.
                </span>
              </div>

              {/* Password / Access Key Field */}
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
                  placeholder="Opp. Inorbit Mall, Link Road, Malad West, Mumbai 400064"
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
                    placeholder="19.1860"
                    value={clientForm.lat ?? 19.1860}
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
                    placeholder="72.8485"
                    value={clientForm.lng ?? 72.8485}
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
                    value={clientForm.billingRatePerPickup || 450}
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

      {/* Credentials Created Notification Modal */}
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

      {/* Add New Route Modal with Custom Time Slots & Multiple Stops */}
      {isAddingRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-sky-700" />
                  <span>Add Collection Route for {selectedClient?.name}</span>
                </h3>
                <p className="text-xs text-slate-500">Configure collection stops and any custom fixed time slots</p>
              </div>
              <button
                onClick={() => setIsAddingRoute(false)}
                className="p-1 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRoute} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Route Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Western Suburbs Morning Loop"
                  value={routeForm.name}
                  onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-sky-600"
                />
              </div>

              {/* Time Slots Section */}
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Fixed Daily Pickup Time Slots (Add 1 or 10+)
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {routeForm.timeSlots.map((slot) => (
                    <span
                      key={slot}
                      className="bg-white border border-slate-200 text-slate-800 font-mono font-bold text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-xs"
                    >
                      <Clock className="w-3 h-3 text-sky-700" />
                      <span>{slot}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTimeSlot(slot)}
                        className="text-slate-400 hover:text-rose-600 ml-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1.5">
                  <input
                    type="time"
                    value={routeForm.newTimeSlotInput}
                    onChange={(e) => setRouteForm({ ...routeForm, newTimeSlotInput: e.target.value })}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-slate-900 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddTimeSlot}
                    className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-md text-xs cursor-pointer"
                  >
                    + Add Time Slot
                  </button>
                </div>
              </div>

              {/* Stops Configuration */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    Hospital / Lab Collection Stops ({routeForm.stops.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddStopToForm}
                    className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold rounded-md border border-sky-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Stop
                  </button>
                </div>

                <div className="space-y-2">
                  {routeForm.stops.map((stop, idx) => (
                    <div
                      key={stop.id || idx}
                      className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-sky-700 text-white font-bold text-[10px] flex items-center justify-center">
                            {idx + 1}
                          </span>
                          Stop #{idx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveStopInForm(idx, 'up')}
                            className={`p-1 rounded text-xs ${
                              idx === 0
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-600 hover:text-sky-700 hover:bg-sky-50 cursor-pointer'
                            }`}
                            title="Move Stop Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === routeForm.stops.length - 1}
                            onClick={() => handleMoveStopInForm(idx, 'down')}
                            className={`p-1 rounded text-xs ${
                              idx === routeForm.stops.length - 1
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-600 hover:text-sky-700 hover:bg-sky-50 cursor-pointer'
                            }`}
                            title="Move Stop Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          {routeForm.stops.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStopFromForm(stop.id)}
                              className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded cursor-pointer"
                              title="Remove Stop"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Hospital Stop Name"
                          value={stop.name}
                          onChange={(e) => {
                            const updated = [...routeForm.stops];
                            updated[idx].name = e.target.value;
                            setRouteForm({ ...routeForm, stops: updated });
                          }}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 font-medium text-xs"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Hospital Full Address"
                          value={stop.address}
                          onChange={(e) => {
                            const updated = [...routeForm.stops];
                            updated[idx].address = e.target.value;
                            setRouteForm({ ...routeForm, stops: updated });
                          }}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Contact Person (e.g. Sister In-charge)"
                          value={stop.contactPerson}
                          onChange={(e) => {
                            const updated = [...routeForm.stops];
                            updated[idx].contactPerson = e.target.value;
                            setRouteForm({ ...routeForm, stops: updated });
                          }}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Phone Number"
                          value={stop.phone}
                          onChange={(e) => {
                            const updated = [...routeForm.stops];
                            updated[idx].phone = e.target.value;
                            setRouteForm({ ...routeForm, stops: updated });
                          }}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 text-xs font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destination Lab Intake */}
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 space-y-2">
                <label className="block text-emerald-800 font-bold uppercase tracking-wider text-[11px]">
                  Destination Diagnostic Lab Handover Point
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Lab Name"
                    value={routeForm.destinationName}
                    onChange={(e) => setRouteForm({ ...routeForm, destinationName: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 text-xs"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Lab Address"
                    value={routeForm.destinationAddress}
                    onChange={(e) => setRouteForm({ ...routeForm, destinationAddress: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingRoute(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold transition-all shadow-xs cursor-pointer"
                >
                  Save Route
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

