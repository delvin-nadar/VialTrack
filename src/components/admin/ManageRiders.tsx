import React, { useState, useMemo } from 'react';
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
  Trash2
} from 'lucide-react';
import { StorageService } from '../../services/storage';

interface ManageRidersProps {
  riders: PickupBoy[];
  routes: Route[];
  onRefresh: () => void;
}

export const ManageRiders: React.FC<ManageRidersProps> = ({ riders, routes, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingRider, setIsAddingRider] = useState(false);
  const [editingRider, setEditingRider] = useState<PickupBoy | null>(null);
  const [createdCredentialsModal, setCreatedCredentialsModal] = useState<{
    name: string;
    phone: string;
    email: string;
    pin: string;
    link: string;
  } | null>(null);

  // Form state
  const [form, setForm] = useState<{
    name: string;
    phone: string;
    email: string;
    vehicleNumber: string;
    vehicleType: string;
    assignedRouteIds: string[];
    status: RiderStatus;
    photoUrl: string;
  }>({
    name: '',
    phone: '',
    email: '',
    vehicleNumber: '',
    vehicleType: 'Hero Splendor Plus (Cold-Box Mounted)',
    assignedRouteIds: [],
    status: 'active',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80'
  });

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
    if (!form.name || !form.phone) return;

    if (editingRider) {
      const updated: PickupBoy = {
        ...editingRider,
        name: form.name,
        phone: form.phone,
        email: form.email || `${form.name.toLowerCase().replace(/\s+/g, '.')}@vialtrack.in`,
        vehicleNumber: form.vehicleNumber || 'MH-02-AB-1234',
        vehicleType: form.vehicleType,
        assignedRouteIds: form.assignedRouteIds,
        status: form.status,
        photoUrl: form.photoUrl
      };
      StorageService.updateRider(updated);
      setEditingRider(null);
    } else {
      const riderEmail = form.email || `${form.name.toLowerCase().replace(/\s+/g, '.')}@vialtrack.in`;
      const newRider: PickupBoy = {
        id: `rider-${Date.now()}`,
        name: form.name,
        phone: form.phone,
        email: riderEmail,
        vehicleNumber: form.vehicleNumber || 'MH-02-XX-9999',
        vehicleType: form.vehicleType,
        photoUrl: form.photoUrl,
        assignedRouteIds: form.assignedRouteIds,
        status: 'active',
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

      // Show credentials modal for sharing with rider
      const baseUrl = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
      setCreatedCredentialsModal({
        name: newRider.name,
        phone: newRider.phone,
        email: newRider.email,
        pin: '1234',
        link: `${baseUrl}/#/rider`
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

  const handleCopyLink = () => {
    if (createdCredentialsModal) {
      const text = `Hello ${createdCredentialsModal.name},\nHere are your SecondMedic VialTrack Rider Portal login credentials:\n\n📱 Portal Link: ${createdCredentialsModal.link}\n🔑 Login ID: ${createdCredentialsModal.phone} or ${createdCredentialsModal.email}\n🔒 Security PIN: ${createdCredentialsModal.pin}\n\nPlease install the app on your Android device and check in before your first collection round.`;
      navigator.clipboard.writeText(text);
      alert('Credentials copied to clipboard! You can send this to the rider via WhatsApp or SMS.');
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
              vehicleNumber: '',
              vehicleType: 'Hero Splendor Plus (Cold-Box Mounted)',
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
                </div>

                {/* Contact & Live Telemetry Info */}
                <div className="mt-3.5 grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Phone:</span>
                    <span className="font-mono text-slate-800 font-medium">{rider.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Battery & GPS:</span>
                    <span className="font-mono text-emerald-700 font-semibold flex items-center gap-1">
                      <Battery className="w-3.5 h-3.5" /> {rider.batteryLevel || 88}% • GPS OK
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
                    onClick={() => {
                      const baseUrl = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
                      setCreatedCredentialsModal({
                        name: rider.name,
                        phone: rider.phone,
                        email: rider.email,
                        pin: '1234',
                        link: `${baseUrl}/#/rider`
                      });
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-sky-700 rounded-lg font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>

                  <button
                    onClick={() => {
                      setForm({
                        name: rider.name,
                        phone: rider.phone,
                        email: rider.email,
                        vehicleNumber: rider.vehicleNumber,
                        vehicleType: rider.vehicleType,
                        assignedRouteIds: rider.assignedRouteIds,
                        status: rider.status,
                        photoUrl: rider.photoUrl
                      });
                      setEditingRider(rider);
                      setIsAddingRider(true);
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-sky-700" />
                    <span>Edit</span>
                  </button>
                </div>

                <button
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
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Bike className="w-5 h-5 text-sky-700" />
                <span>{editingRider ? 'Edit Pickup Boy' : 'Register New Pickup Boy (Rider)'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsAddingRider(false);
                  setEditingRider(null);
                }}
                className="p-1 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRider} className="space-y-3.5 text-xs">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Phone (Primary Login ID) *
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Vehicle Registration Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="MH-02-DN-4921"
                    value={form.vehicleNumber}
                    onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono uppercase focus:outline-hidden focus:border-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px]">
                    Vehicle Type
                  </label>
                  <input
                    type="text"
                    placeholder="Hero Splendor / Chiller Rack"
                    value={form.vehicleType}
                    onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-sky-600"
                  />
                </div>
              </div>

              {/* Assign Routes */}
              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1.5 text-[11px]">
                  Assign Collection Routes ({form.assignedRouteIds.length} Selected)
                </label>
                <div className="space-y-1 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
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
                  Rider Operational Status
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
                <p className="text-xs text-slate-500">Hand these to the rider for mobile PWA login</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-2">
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Rider Name:</span>
                <span className="font-bold text-slate-900 text-sm">{createdCredentialsModal.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Rider Portal Direct URL:</span>
                <code className="text-sky-700 font-mono font-semibold break-all">{createdCredentialsModal.link}</code>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Phone / Login ID:</span>
                  <span className="font-mono text-slate-800 font-bold">{createdCredentialsModal.phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Default Security PIN:</span>
                  <span className="font-mono text-emerald-700 font-bold">{createdCredentialsModal.pin}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleCopyLink}
                className="flex-1 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>Copy WhatsApp Message</span>
              </button>
              <button
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
