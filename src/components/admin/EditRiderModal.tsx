import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PickupBoy, Route, RiderStatus } from '../../types';
import {
  Bike,
  X,
  Camera,
  KeyRound,
  RefreshCw,
  Clock,
  Car,
  AlertCircle,
  Check
} from 'lucide-react';
import { StorageService } from '../../services/storage';
import { compressImageToBase64 } from '../../services/imageWatermark';
import { generateStrongPassword } from '../../utils/security';
import { db } from '../../services/firebase';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

const defaultAvailableRoutes: Route[] = [
  {
    id: 'route_lifecare_loop_1',
    clientId: 'client-1788210054008',
    name: 'Lifecare Diagnostics - Loop 1',
    description: 'Oscar Hospital & Oscar Superspeciality to Lifecare Hub',
    destinationLab: {
      id: 'dest_lifecare',
      name: 'Lifecare Diagnostics',
      address: 'Cosmos Plaza, 206, D.N. Nagar, Andheri West, Mumbai 400053',
      lat: 19.1287852,
      lng: 72.8294183,
      contactPerson: 'Dr. Jayesh Joshi',
      phone: '+91 98200 98200'
    },
    stops: [
      {
        id: 'stop_1',
        name: 'Oscar Hospital',
        address: 'D & E Wing, Pooja Enclave, Kandivali West',
        lat: 19.2082,
        lng: 72.8396,
        contactPerson: 'Dr. Ramesh Patil',
        phone: '+91 98201 22334',
        order: 1
      },
      {
        id: 'stop_2',
        name: 'Oscar Superspeciality Hospital',
        address: 'Shepherd Royal, New Link Rd, Goregaon West',
        lat: 19.1610,
        lng: 72.8346,
        contactPerson: 'Sister Reena',
        phone: '+91 98202 33445',
        order: 2
      }
    ],
    timeSlots: ['09:00', '12:00', '15:00', '18:00'],
    active: true
  }
];

interface EditRiderModalProps {
  isOpen: boolean;
  rider: PickupBoy | null;
  routes: Route[];
  onClose: () => void;
  onSaved: (createdCredentials?: { name: string; phone: string; email: string; password: string }) => void;
}

export const EditRiderModal: React.FC<EditRiderModalProps> = ({
  isOpen,
  rider,
  routes,
  onClose,
  onSaved
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  const availableRoutes = useMemo(() => {
    const map = new Map<string, Route>();
    defaultAvailableRoutes.forEach((r) => map.set(r.id, r));
    routes.forEach((r) => map.set(r.id, r));
    return Array.from(map.values());
  }, [routes]);

  const [form, setForm] = useState<{
    name: string;
    phone: string;
    email: string;
    password: string; // Only set when explicitly entered by admin
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
    vehicleType: 'Motorcycle / Bike',
    shiftTimings: '08:00 AM - 04:00 PM (Morning Slot)',
    assignedRouteIds: ['route_lifecare_loop_1'],
    status: 'active',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80'
  });

  useEffect(() => {
    if (rider) {
      // Editing existing rider:
      // CRITICAL: Do NOT populate password with existing or generated password
      const initialAssignedRoutes =
        rider.assignedRouteIds && rider.assignedRouteIds.length > 0
          ? rider.assignedRouteIds
          : ['route_lifecare_loop_1'];

      setForm({
        name: rider.name || '',
        phone: rider.phone || '',
        email: rider.email || '',
        password: '', // Blank so existing password is never overwritten accidentally
        plateNumber: rider.plateNumber || rider.vehicleNumber || 'MH01AV8888',
        vehicleNumber: rider.vehicleNumber || rider.plateNumber || 'MH01AV8888',
        vehicleType: rider.vehicleType || 'Motorcycle / Bike',
        shiftTimings: rider.shiftTimings || '08:00 AM - 04:00 PM (Morning Slot)',
        assignedRouteIds: initialAssignedRoutes,
        status: rider.status || 'active',
        photoUrl: rider.photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80'
      });
    } else {
      // New rider creation: generate a default password
      setForm({
        name: '',
        phone: '',
        email: '',
        password: generateStrongPassword(8),
        plateNumber: 'MH01AV8888',
        vehicleNumber: 'MH01AV8888',
        vehicleType: 'Motorcycle / Bike',
        shiftTimings: '08:00 AM - 04:00 PM (Morning Slot)',
        assignedRouteIds: ['route_lifecare_loop_1'],
        status: 'active',
        photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80'
      });
    }
    setFormError(null);
  }, [rider, isOpen]);

  if (!isOpen) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingPhoto(true);
    try {
      const base64 = await compressImageToBase64(file, 800, 0.6);
      setForm((prev) => ({ ...prev, photoUrl: base64 }));
    } catch (err) {
      console.error('Failed to compress rider photo:', err);
      setFormError('Could not process rider photo image.');
    } finally {
      setIsCompressingPhoto(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleGeneratePassword = () => {
    const strong = generateStrongPassword(8);
    setForm((prev) => ({ ...prev, password: strong }));
    setFormError(null);
  };

  const handleToggleRoute = (routeId: string) => {
    setForm((prev) => {
      const exists = prev.assignedRouteIds.includes(routeId);
      return {
        ...prev,
        assignedRouteIds: exists
          ? prev.assignedRouteIds.filter((id) => id !== routeId)
          : [...prev.assignedRouteIds, routeId]
      };
    });
  };

  // Helper to auto-generate live task document if no active task exists
  const ensureLiveTaskGenerated = async (
    riderData: {
      id: string;
      name: string;
      phone: string;
      vehiclePlate: string;
    },
    routeIds: string[]
  ) => {
    if (!routeIds || routeIds.length === 0) return;

    try {
      // Check if an active task already exists for this rider in 'tasks'
      let existingTasks: any[] = [];
      try {
        const q = query(collection(db, 'tasks'), where('riderId', '==', riderData.id));
        const snap = await getDocs(q);
        existingTasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (checkErr) {
        console.warn('[EditRiderModal] Query tasks warning:', checkErr);
      }

      for (const selectedRouteId of routeIds) {
        const selectedRouteDetails = availableRoutes.find((r) => r.id === selectedRouteId) || {
          id: selectedRouteId,
          clientId: 'client-1788210054008',
          clientName: 'Lifecare Diagnostics',
          name: 'Lifecare Diagnostics - Loop 1',
          stops: [
            {
              id: 'stop_1',
              name: 'Oscar Hospital',
              address: 'D & E Wing, Pooja Enclave, Kandivali West',
              lat: 19.2082,
              lng: 72.8396,
              status: 'pending' as const,
              specimenCount: 0
            },
            {
              id: 'stop_2',
              name: 'Oscar Superspeciality Hospital',
              address: 'Shepherd Royal, New Link Rd, Goregaon West',
              lat: 19.1610,
              lng: 72.8346,
              status: 'pending' as const,
              specimenCount: 0
            }
          ]
        };

        const hasActiveTask = existingTasks.some(
          (t) =>
            (t.routeId === selectedRouteId || t.routeName === selectedRouteDetails.name) &&
            t.status !== 'completed' &&
            t.status !== 'delivered' &&
            t.status !== 'cancelled'
        );

        if (!hasActiveTask) {
          const taskId = `task_${Date.now()}`;
          const normalizedStops =
            selectedRouteDetails.stops && selectedRouteDetails.stops.length > 0
              ? selectedRouteDetails.stops.map((stop: any, index: number) => ({
                  id: stop.id || `stop_${index + 1}`,
                  name: stop.name || `Collection Stop ${index + 1}`,
                  address: stop.address || (index === 0 ? 'D & E Wing, Pooja Enclave, Kandivali West' : 'Shepherd Royal, New Link Rd, Goregaon West'),
                  lat: Number(stop.lat || (index === 0 ? 19.2082 : 19.1610)),
                  lng: Number(stop.lng || (index === 0 ? 72.8396 : 72.8346)),
                  status: 'pending' as const,
                  specimenCount: Number(stop.specimenCount || 0)
                }))
              : [
                  {
                    id: 'stop_1',
                    name: 'Oscar Hospital',
                    address: 'D & E Wing, Pooja Enclave, Kandivali West',
                    lat: 19.2082,
                    lng: 72.8396,
                    status: 'pending' as const,
                    specimenCount: 0
                  },
                  {
                    id: 'stop_2',
                    name: 'Oscar Superspeciality Hospital',
                    address: 'Shepherd Royal, New Link Rd, Goregaon West',
                    lat: 19.1610,
                    lng: 72.8346,
                    status: 'pending' as const,
                    specimenCount: 0
                  }
                ];

          const taskDocPayload = {
            id: taskId,
            taskId: taskId,
            clientId: selectedRouteDetails.clientId || 'client-1788210054008',
            clientName: (selectedRouteDetails as any).clientName || (selectedRouteDetails as any).destinationLab?.name || 'Lifecare Diagnostics',
            clientEmail: (selectedRouteDetails as any).clientEmail || (selectedRouteDetails as any).destinationLab?.email || 'jayesh.joshi@lifecarediagnostics.com',
            clientLabId: selectedRouteDetails.clientId || 'client-1788210054008',
            clientLabName: (selectedRouteDetails as any).clientName || (selectedRouteDetails as any).destinationLab?.name || 'Lifecare Diagnostics',
            routeName: selectedRouteDetails.name || 'Lifecare Diagnostics - Loop 1',
            routeId: selectedRouteDetails.id || selectedRouteId,
            riderId: riderData.id || 'rider_asif',
            riderName: riderData.name || 'Asif',
            riderPhone: riderData.phone || '8268826200',
            riderVehicle: riderData.vehiclePlate || 'MH01AV8888',
            assignedRiderId: riderData.id || 'rider_asif',
            assignedRiderName: riderData.name || 'Asif',
            assignedRiderPhone: riderData.phone || '8268826200',
            status: 'assigned' as const,
            currentStopIndex: 0,
            stops: normalizedStops,
            stopsProgress: normalizedStops.map((s: any) => ({
              stopId: s.id,
              stopName: s.name,
              address: s.address,
              lat: s.lat,
              lng: s.lng,
              status: 'pending',
              sampleCount: s.specimenCount,
              specimenCount: s.specimenCount
            })),
            date: new Date().toISOString().split('T')[0],
            scheduledDate: new Date().toISOString().split('T')[0],
            timeSlot: 'Morning Slot (09:00 AM - 01:00 PM)',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          await setDoc(doc(db, 'tasks', taskId), taskDocPayload, { merge: true });
          console.log(`[EditRiderModal] Auto-generated live task ${taskId} in Firestore`);

          // Update rider doc with activeTaskId & dutyStatus
          await setDoc(
            doc(db, 'riders', riderData.id),
            {
              activeTaskId: taskId,
              activeTripId: taskId,
              activeRouteId: selectedRouteDetails.id || selectedRouteId,
              dutyStatus: 'on_trip',
              lastUpdated: serverTimestamp()
            },
            { merge: true }
          );
        }
      }
    } catch (genErr) {
      console.warn('[EditRiderModal] Live task auto-generation error:', genErr);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = form.name.trim();
    const cleanPhone = form.phone.trim();
    if (!cleanName) {
      setFormError('Rider Full Name is required.');
      return;
    }
    if (!cleanPhone) {
      setFormError('Phone number is required.');
      return;
    }

    // For new riders, password is required (minimum 4 chars or 8 chars)
    if (!rider && (!form.password || form.password.length < 4)) {
      setFormError('Please enter a password/PIN of at least 4 characters for the new rider.');
      return;
    }

    // If an existing rider is edited and admin typed a password, ensure it's at least 4 chars
    if (rider && form.password.trim() && form.password.trim().length < 4) {
      setFormError('New password must be at least 4 characters long.');
      return;
    }

    const effectivePlate = form.plateNumber.trim() || form.vehicleNumber.trim() || 'MH01AV8888';
    const effectiveVehicleType = form.vehicleType || 'Motorcycle / Bike';

    if (rider) {
      // EDIT EXISTING RIDER
      // Only overwrite password if admin explicitly typed a new non-empty password
      const newPasswordTyped = form.password.trim();
      const preservedPassword = newPasswordTyped ? newPasswordTyped : (rider.password || '8268826200');

      const updatedRider: PickupBoy = {
        ...rider,
        name: cleanName,
        phone: cleanPhone,
        email: form.email.trim() || `${cleanName.toLowerCase().replace(/\s+/g, '.')}@vialtrack.in`,
        password: preservedPassword,
        plateNumber: effectivePlate,
        vehicleNumber: effectivePlate,
        vehicleType: effectiveVehicleType,
        shiftTimings: form.shiftTimings,
        assignedRouteIds: form.assignedRouteIds,
        status: form.status,
        photoUrl: form.photoUrl,
        mustChangePassword: newPasswordTyped ? false : (rider.mustChangePassword ?? false)
      };

      StorageService.updateRider(updatedRider);

      // Save to Firestore: ONLY update password field if explicitly changed by admin
      try {
        const firestorePayload: any = {
          id: updatedRider.id,
          name: updatedRider.name,
          phone: updatedRider.phone,
          email: updatedRider.email,
          vehicleNo: effectivePlate,
          vehicleNumber: effectivePlate,
          vehiclePlate: effectivePlate,
          vehicleType: effectiveVehicleType,
          status: updatedRider.status,
          shiftTimings: updatedRider.shiftTimings,
          assignedRouteIds: updatedRider.assignedRouteIds,
          photoUrl: updatedRider.photoUrl,
          isOnline: true,
          isCheckedIn: true,
          lastUpdated: serverTimestamp()
        };

        if (newPasswordTyped) {
          firestorePayload.password = newPasswordTyped;
        }

        await setDoc(doc(db, 'riders', updatedRider.id), firestorePayload, { merge: true });

        // Auto-instantiate live task document if rider has assigned routes and no active task exists
        await ensureLiveTaskGenerated(
          {
            id: updatedRider.id,
            name: updatedRider.name,
            phone: updatedRider.phone,
            vehiclePlate: effectivePlate
          },
          form.assignedRouteIds
        );
      } catch (err: any) {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
          console.warn('Firestore quota exceeded; updated rider locally.');
        } else {
          console.error("Firestore Write Error:", err);
        }
      }

      onSaved();
      onClose();
    } else {
      // CREATE NEW RIDER
      const riderId = `rider-${cleanPhone.replace(/\D/g, '') || Date.now()}`;
      const riderEmail = form.email.trim() || `${cleanName.toLowerCase().replace(/\s+/g, '.')}@vialtrack.in`;
      const effectivePassword = form.password.trim() || generateStrongPassword(8);

      const newRider: PickupBoy = {
        id: riderId,
        name: cleanName,
        phone: cleanPhone,
        email: riderEmail,
        password: effectivePassword,
        role: 'rider',
        plateNumber: effectivePlate,
        vehicleNumber: effectivePlate,
        vehicleType: effectiveVehicleType,
        shiftTimings: form.shiftTimings,
        photoUrl: form.photoUrl,
        assignedRouteIds: form.assignedRouteIds,
        status: 'active',
        mustChangePassword: false,
        failedAttempts: 0,
        joiningDate: new Date().toISOString().split('T')[0],
        currentLocation: {
          lat: 19.1287,
          lng: 72.8294,
          timestamp: new Date().toISOString(),
          accuracy: 5
        },
        batteryLevel: 95,
        isOnline: true,
        isCheckedIn: true
      };

      StorageService.addRider(newRider);

      try {
        await setDoc(
          doc(db, 'riders', newRider.id),
          {
            id: newRider.id,
            name: newRider.name,
            phone: newRider.phone,
            email: newRider.email,
            password: effectivePassword,
            vehicleNo: effectivePlate,
            vehicleNumber: effectivePlate,
            vehiclePlate: effectivePlate,
            vehicleType: effectiveVehicleType,
            battery: 95,
            isOnline: true,
            isCheckedIn: true,
            status: 'active',
            shiftTimings: newRider.shiftTimings,
            assignedRouteIds: newRider.assignedRouteIds,
            photoUrl: newRider.photoUrl,
            lastUpdated: serverTimestamp()
          },
          { merge: true }
        );

        // Auto-instantiate live task document on route assignment
        await ensureLiveTaskGenerated(
          {
            id: newRider.id,
            name: newRider.name,
            phone: newRider.phone,
            vehiclePlate: effectivePlate
          },
          form.assignedRouteIds
        );
      } catch (err: any) {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
          console.warn('Firestore quota exceeded; created rider locally.');
        } else {
          console.error("Firestore Write Error:", err);
        }
      }

      onSaved({
        name: newRider.name,
        phone: newRider.phone,
        email: newRider.email,
        password: effectivePassword
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Bike className="w-5 h-5 text-sky-700" />
            <span>{rider ? 'Edit Pickup Boy (Rider)' : 'Register New Pickup Boy (Rider)'}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
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

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
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
              <p className="text-[11px] text-slate-500 mb-2">Upload ID Photo</p>
              <button
                type="button"
                onClick={() => photoFileInputRef.current?.click()}
                disabled={isCompressingPhoto}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-700 font-semibold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-sky-700" />
                <span>{isCompressingPhoto ? 'Compressing...' : 'Upload Photo'}</span>
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
              placeholder="e.g. Asif Khan"
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
                placeholder="+91 82688 26200"
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
                placeholder="asif.khan@vialtrack.in"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:border-sky-600"
              />
            </div>
          </div>

          {/* Password / Access Key Input */}
          <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sky-950 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-sky-700" />
                <span>Password / Access Key {rider ? '(Leave blank to keep existing password)' : '*'}</span>
              </label>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="text-[11px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 bg-white border border-sky-300 px-2 py-0.5 rounded shadow-2xs cursor-pointer hover:bg-sky-50 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate Password</span>
              </button>
            </div>
            <input
              type="text"
              placeholder={rider ? 'Leave blank to keep existing password' : 'e.g. Asif@2026 or 4-6 digit PIN'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-sky-300 rounded-lg text-slate-900 font-mono font-medium focus:outline-hidden focus:border-sky-600 placeholder:font-sans placeholder:text-slate-400"
            />
            <p className="text-[10px] text-slate-500">
              {rider
                ? 'Leave empty to preserve existing password. Only enter text if you want to reset password.'
                : 'Enter a strong password or 4-6 digit security PIN for the rider to log into the Rider Portal.'}
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
                placeholder="MH-02-DN-4821"
                value={form.plateNumber || form.vehicleNumber}
                onChange={(e) => setForm({ ...form, plateNumber: e.target.value, vehicleNumber: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono uppercase focus:outline-hidden focus:border-sky-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold uppercase tracking-wider mb-1 text-[11px] flex items-center gap-1">
                <Bike className="w-3.5 h-3.5 text-slate-500" />
                <span>Vehicle Type</span>
              </label>
              <select
                value={form.vehicleType}
                onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-sky-600"
              >
                <option value="Motorcycle / Bike">Motorcycle / Bike (Cold-Box Mounted)</option>
                <option value="Scooter / Scooty">Scooter / Scooty</option>
                <option value="Electric EV 2-Wheeler">Electric EV 2-Wheeler</option>
              </select>
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
              {availableRoutes.map((r) => {
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
                    <span className="text-[10px] text-slate-500">{r.stops?.length || 0} Stops</span>
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
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold transition-all shadow-xs cursor-pointer"
            >
              {rider ? 'Save Changes' : 'Create Rider Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
