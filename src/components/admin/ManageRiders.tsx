import React, { useState, useMemo, useRef } from 'react';
import { PickupBoy, Route, RiderStatus } from '../../types';
import {
  Bike,
  Plus,
  Edit2,
  Phone,
  Mail,
  Shield,
  MapPin,
  CheckCircle2,
  X,
  Copy,
  Share2,
  Smartphone,
  Battery,
  Radio,
  Calendar,
  AlertCircle,
  Search,
  Trash2,
  Camera,
  UploadCloud,
  Check,
  KeyRound,
  RefreshCw,
  Clock,
  Car
} from 'lucide-react';
import { StorageService } from '../../services/storage';
import { isRiderLocationStale } from '../../services/locationService';
import { compressImageToBase64 } from '../../services/imageWatermark';
import { generateStrongPassword, validatePasswordStrength, formatCredentialsMessage, copyTextToClipboard } from '../../utils/security';

interface ManageRidersProps {
  riders: PickupBoy[];
  routes: Route[];
  onRefresh: () => void;
}

export const ManageRiders: React.FC<ManageRidersProps> = ({ riders, routes, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingRider, setIsAddingRider] = useState(false);
  const [editingRider, setEditingRider] = useState<PickupBoy | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdCredentialsModal, setCreatedCredentialsModal] = useState<{
    name: string;
    phone: string;
    email: string;
    password: string;
    portalUrl: string;
  } | null>(null);

  // Photo input ref
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const [isCompressingRiderPhoto, setIsCompressingRiderPhoto] = useState(false);

  // Handle rider profile picture upload with max 800px 0.6 JPEG canvas compression
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingRiderPhoto(true);
    try {
      const base64 = await compressImageToBase64(file, 800, 0.6);
      setForm((prev) => ({ ...prev, photoUrl: base64 }));
    } catch (err) {
      console.error('Failed to compress rider photo:', err);
      alert('Could not process rider image.');
    } finally {
      setIsCompressingRiderPhoto(false);
      if (e.target) e.target.value = '';
    }
  };

  // Form state
  const [form, setForm] = useState<{
    name: string;
    phone: string;
    email: string;
    password: string;
    plateNumber: string;
    vehicleNumber: string;
    vehicleType: string;
    shiftTimings: string;
    assignedRouteIds: string[];
    status: RiderStatus;
    photoUrl: string;
  }>({
    name: '',
    phone: '',
    email: '',
    password: '',
    plateNumber: '',
    vehicleNumber: '',
    vehicleType: 'Hero Splendor Plus (Cold-Box Mounted)',
    shiftTimings: '08:00 AM - 04:00 PM (Morning Slot)',
    assignedRouteIds: [],
    status: 'active',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80'
  });

  const handleGeneratePassword = () => {
    const strong = generateStrongPassword(9);
    setForm((prev) => ({ ...prev, password: strong }));
    setFormError(null);
  };

  const handleDeleteRider = (riderId: string, riderName: string) => {
    if (window.confirm(`Are you sure you want to remove rider "${riderName}" from the fleet?`)) {
      StorageService.deleteRider(riderId);
      onRefresh();
    }
  };

  const filteredRiders = useMemo(() => {
    if (!searchTerm.trim()) return riders;
    const term = searchTerm.toLowerCase();
    return riders.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.phone.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        r.vehicleNumber.toLowerCase().includes(term)
    );
  }, [riders, searchTerm]);

  const handleSaveRider = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError('Rider Full Name is required.');
      return;
    }
    if (!form.phone.trim()) {
      setFormError('Phone number (Primary Login ID) is required.');
      return;
    }

    // Minimum 8 characters validation rule
    if (form.password && form.password.length < 8) {
      setFormError('Password / Access Key must be at least 8 characters long.');
      return;
    }

    const effectivePassword = form.password || (editingRider?.password ? editingRider.password : generateStrongPassword(9));
    const effectivePlate = form.plateNumber || form.vehicleNumber || 'MH-02-XX-9999';

    if (editingRider) {
      const updated: PickupBoy = {
        ...editingRider,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || `${form.name.toLowerCase().replace(/\s+/g, '.')}@vialtrack.in`,
        password: effectivePassword,
        role: 'rider',
        plateNumber: effectivePlate,
        vehicleNumber: effectivePlate,
        vehicleType: form.vehicleType || 'Hero Splendor / Motorcycle',
        shiftTimings: form.shiftTimings,
        assignedRouteIds: form.assignedRouteIds,
        status: form.status,
        photoUrl: form.photoUrl,
        mustChangePassword: editingRider.mustChangePassword ?? false,
        failedAttempts: editingRider.failedAttempts ?? 0
      };
      StorageService.updateRider(updated);
      setEditingRider(null);
    } else {
      const riderEmail = form.email.trim() || `${form.name.toLowerCase().replace(/\s+/g, '.')}@vialtrack.in`;
      const newRider: PickupBoy = {
        id: `rider-${Date.now()}`,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: riderEmail,
        password: effectivePassword,
        role: 'rider',
        plateNumber: effectivePlate,
        vehicleNumber: effectivePlate,
        vehicleType: form.vehicleType || 'Hero Splendor / Motorcycle',
        shiftTimings: form.shiftTimings,
        photoUrl: form.photoUrl,
        assignedRouteIds: form.assignedRouteIds,
        status: 'active',
        mustChangePassword: true,
        failedAttempts: 0,
        joiningDate: new Date().toISOString().split('T')[0],
        currentLocation: {
          lat: 19.2082,
          lng: 72.8398,
          timestamp: new Date().toISOString(),
          accuracy: 5
        },
        batteryLevel: 95,
        isOnline: true,
        isCheckedIn: true
      };
      StorageService.addRider(newRider);

      // Show formatted credentials modal with copy action
      setCreatedCredentialsModal({
        name: newRider.name,
        phone: newRider.phone,
        email: newRider.email,
        password: effectivePassword,
        portalUrl: 'https://delvin-nadar.github.io/VialTrack/#/rider'
      });
    }

    setIsAddingRider(false);
    onRefresh();
  };

  const handleToggleRoute = (routeId: string) => {
    if (form.assignedRouteIds.includes(routeId)) {
      setForm({
        ...form,
        assignedRouteIds: form.assignedRouteIds.filter((id) => id !== routeId)
      });
    } else {
      setForm({
        ...form,
        assignedRouteIds: [...form.assignedRouteIds, routeId]
      });
    }
  };

  const handleCopyFormattedCredentials = async (loginId: string, tempPassword: string) => {
    const text = formatCredentialsMessage({
      portalUrl: 'https://delvin-nadar.github.io/VialTrack/#/rider',
      loginId,
      tempPassword
    });
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  const handleCopyCredentialsInModal = async () => {
    if (createdCredentialsModal) {
      await handleCopyFormattedCredentials(
        createdCredentialsModal.phone || createdCredentialsModal.email,
        createdCredentialsModal.password
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-4 sm:p-5 rounded-xl shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Bike className="w-5 h-5 text-sky-700" />
            <span>Manage Pickup Boys (Riders Fleet)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Create rider login credentials, assign collection routes, and monitor live fleet connectivity. No public self-registration.
          </p>
        </div>

        <button
          onClick={() => {
            setForm({
              name: '',
              phone: '',
              email: '',
              password: '',
              plateNumber: '',
              vehicleNumber: '',
              vehicleType: 'Hero Splendor Plus (Cold-Box Mounted)',
              shiftTimings: '08:00 AM - 04:00 PM (Morning Slot)',
              assignedRouteIds: routes[0] ? [routes[0].id] : [],
              status: 'active',
              photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80'
            });
            setIsAddingRider(true);
            setEditingRider(null);
          }}
          className="px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Pickup Boy</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search riders by name, phone, email, or vehicle number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-sky-600 outline-hidden"
          />
        </div>
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap hidden sm:inline">
          {filteredRiders.length} of {riders.length} Riders Active
        </span>
      </div>

      {/* Riders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRiders.map((rider) => {
          const assignedRoutes = routes.filter((r) => rider.assignedRouteIds.includes(r.id));

          return (
            <div
              key={rider.id}
              className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
            >
              <div>
                {/* Rider Photo & Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={rider.photoUrl}
                      alt={rider.name}
                      className="w-11 h-11 rounded-lg object-cover border border-slate-200 shadow-xs"
                    />
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{rider.name}</h4>
                      <p className="text-xs text-sky-700 font-mono font-medium">{rider.vehicleNumber}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        rider.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : rider.status === 'on_leave'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {rider.status === 'active' ? 'Active / On-Duty' : rider.status}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        isRiderLocationStale(rider, 10)
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1'
                      }`}
                    >
                      {!isRiderLocationStale(rider, 10) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                      {isRiderLocationStale(rider, 10) ? 'GPS Stale / Offline' : 'Live GPS'}
                    </span>
                  </div>
                </div>

                {/* Contact & Live Telemetry Info */}
                <div className="mt-3.5 grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Phone:</span>
                    <span className="font-mono text-slate-800 font-medium">{rider.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Battery & GPS:</span>
                    <span className={`font-mono font-semibold flex items-center gap-1 ${isRiderLocationStale(rider, 10) ? 'text-amber-700' : 'text-emerald-700'}`}>
                      <Battery className="w-3.5 h-3.5" /> {rider.batteryLevel || 88}% • {isRiderLocationStale(rider, 10) ? 'GPS Stale' : 'GPS OK'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Email / Login ID:</span>
                    <span className="font-mono text-slate-700 text-[11px] truncate block">{rider.email}</span>
                  </div>
                </div>

                {/* Assigned Routes */}
                <div className="mt-3 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Assigned Collection Routes:
                  </span>
                  {assignedRoutes.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No routes currently assigned</span>
                  ) : (
                    <div className="space-y-1">
                      {assignedRoutes.map((r) => (
                        <div
                          key={r.id}
                          className="text-xs bg-slate-50 text-slate-800 px-2.5 py-1 rounded-md border border-slate-200 flex items-center justify-between"
                        >
                          <span className="truncate">{r.name}</span>
                          <span className="text-[10px] text-sky-700 font-mono shrink-0 ml-1 font-semibold">
                            {r.stops.length} Stops
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyFormattedCredentials(rider.phone || rider.email, rider.password || 'SecondMedicOps@2026')}
                    className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-lg font-bold flex items-center gap-1.5 transition-colors border border-sky-200 cursor-pointer"
                    title="Copy formatted credentials text to clipboard"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copySuccess ? 'Copied!' : 'Copy Credentials'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setForm({
                        name: rider.name,
                        phone: rider.phone,
                        email: rider.email,
                        password: rider.password || '',
                        plateNumber: rider.plateNumber || rider.vehicleNumber || '',
                        vehicleNumber: rider.vehicleNumber || '',
                        vehicleType: rider.vehicleType || 'Hero Splendor Plus (Cold-Box Mounted)',
                        shiftTimings: rider.shiftTimings || '08:00 AM - 04:00 PM (Morning Slot)',
                        assignedRouteIds: rider.assignedRouteIds || [],
                        status: rider.status,
                        photoUrl: rider.photoUrl
                      });
                      setEditingRider(rider);
                      setIsAddingRider(true);
                      setFormError(null);
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-sky-700" />
                    <span>Edit</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteRider(rider.id, rider.name)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200 cursor-pointer"
                  title="Remove Rider from Fleet"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Rider Modal */}
      {isAddingRider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Bike className="w-5 h-5 text-sky-700" />
                <span>{editingRider ? 'Edit Pickup Boy (Rider)' : 'Register New Pickup Boy (Rider)'}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddingRider(false);
                  setEditingRider(null);
                  setFormError(null);
                }}
                className="p-1 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRider} className="space-y-3.5 text-xs">
              {/* Rider Photo Avatar */}
              <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <input
                  ref={photoFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-sky-600 bg-slate-200 shrink-0">
                  <img
                    src={form.photoUrl}
                    alt={form.name || 'Rider avatar'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-xs">Rider Photo ID</p>
                  <p className="text-[11px] text-slate-500 mb-2">Base64 canvas compressed (Max 800px JPEG)</p>
                  <button
                    type="button"
                    onClick={() => photoFileInputRef.current?.click()}
                    disabled={isCompressingRiderPhoto}
                    className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-700 font-semibold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-sky-700" />
                    <span>{isCompressingRiderPhoto ? 'Compressing...' : 'Upload Photo'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Rider Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-sky-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Phone Number (Primary Login ID) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="rahul.sharma@vialtrack.in"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
                  />
                </div>
              </div>

              {/* Password / Access Key with Generator */}
              <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sky-950 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-sky-700" />
                    <span>Password / Access Key {editingRider ? '(Leave blank to keep existing)' : '*'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[11px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 bg-white border border-sky-300 px-2 py-0.5 rounded shadow-2xs cursor-pointer hover:bg-sky-50 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generate Strong Password</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder={editingRider ? '•••••••• (unchanged)' : 'e.g. Vk8#9xQ2 (Min 8 alphanumeric + symbols)'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-sky-300 rounded-lg text-slate-900 font-mono font-medium focus:outline-hidden focus:border-sky-600"
                />
                <p className="text-[10px] text-slate-500">
                  Must be at least 8 characters. On first login, riders will be prompted to set their permanent password.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px] flex items-center gap-1">
                    <Car className="w-3.5 h-3.5 text-slate-500" />
                    <span>Vehicle Plate Number *</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="MH-02-DN-4921"
                    value={form.plateNumber || form.vehicleNumber}
                    onChange={(e) => setForm({ ...form, plateNumber: e.target.value, vehicleNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono uppercase focus:outline-hidden focus:border-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Vehicle Type
                  </label>
                  <input
                    type="text"
                    placeholder="Hero Splendor / Motorcycle"
                    value={form.vehicleType}
                    onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-sky-600"
                  />
                </div>
              </div>

              {/* Shift Timings */}
              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Shift Timings *</span>
                </label>
                <select
                  value={form.shiftTimings}
                  onChange={(e) => setForm({ ...form, shiftTimings: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-sky-600"
                >
                  <option value="08:00 AM - 04:00 PM (Morning Slot)">08:00 AM - 04:00 PM (Morning Slot)</option>
                  <option value="01:00 PM - 09:00 PM (Evening Slot)">01:00 PM - 09:00 PM (Evening Slot)</option>
                  <option value="09:00 PM - 05:00 AM (Night Emergency)">09:00 PM - 05:00 AM (Night Emergency)</option>
                  <option value="07:00 AM - 07:00 PM (Full Day 12H)">07:00 AM - 07:00 PM (Full Day 12H)</option>
                </select>
              </div>

              {/* Assign Routes */}
              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1.5 text-[11px]">
                  Assign Collection Routes ({form.assignedRouteIds.length} Selected)
                </label>
                <div className="space-y-1 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                  {routes.map((r) => {
                    const isChecked = form.assignedRouteIds.includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                          isChecked ? 'bg-sky-50 border border-sky-200 text-sky-900' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleRoute(r.id)}
                            className="rounded border-slate-300 text-sky-700 focus:ring-sky-600"
                          />
                          <span className="font-semibold">{r.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{r.stops.length} Stops</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                  Rider Operational Status (Default: Active)
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as RiderStatus })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-sky-600"
                >
                  <option value="active">Active & Available for Rounds</option>
                  <option value="on_leave">On Leave / Sick</option>
                  <option value="inactive">Inactive / Deactivated</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingRider(false);
                    setEditingRider(null);
                    setFormError(null);
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold transition-all shadow-xs cursor-pointer"
                >
                  {editingRider ? 'Save Changes' : 'Create Rider Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Created Credentials Modal */}
      {createdCredentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Rider Credentials Generated</h3>
                <p className="text-xs text-slate-500">Provide these credentials for mobile PWA login</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-2">
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Rider Name:</span>
                <span className="font-bold text-slate-900 text-sm">{createdCredentialsModal.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Portal URL:</span>
                <code className="text-sky-700 font-mono font-semibold break-all">{createdCredentialsModal.portalUrl}</code>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Login ID (Phone):</span>
                  <span className="font-mono text-slate-800 font-bold">{createdCredentialsModal.phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Temporary Password:</span>
                  <span className="font-mono text-emerald-700 font-bold">{createdCredentialsModal.password}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyCredentialsInModal}
                className="flex-1 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>{copySuccess ? 'Copied to Clipboard!' : 'Copy Credentials'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedCredentialsModal(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
