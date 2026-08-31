import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { UserAuth, PickupTask, Route as LogisticsRoute, PickupBoy, Client, AttendanceRecord, NotificationLog, LocationPing } from './types';
import { StorageService } from './services/storage';
import { LocationService } from './services/locationService';
import { NotificationService } from './services/notificationService';
import { CloudSync, auth, signOut, onAuthStateChanged } from './services/firebase';

// Portals & Components
import { PortalLanding } from './components/common/PortalLanding';
import { AdminHeader } from './components/admin/AdminHeader';
import { ClientHeader } from './components/client/ClientHeader';
import { RiderHeader } from './components/rider/RiderHeader';
import { Footer } from './components/common/Footer';
import { ProofModal } from './components/common/ProofModal';
import { NotificationDrawer } from './components/common/NotificationDrawer';
import { LoadingSkeleton } from './components/common/LoadingSkeleton';
import { MumbaiMapDashboard } from './components/common/MumbaiMapDashboard';

// Auth & Route Protection
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminLogin } from './components/auth/AdminLogin';
import { ClientLogin } from './components/auth/ClientLogin';
import { RiderLogin } from './components/auth/RiderLogin';
import { ForcePasswordModal } from './components/auth/ForcePasswordModal';

// Admin Views
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ManageClients } from './components/admin/ManageClients';
import { ManageRiders } from './components/admin/ManageRiders';
import { AttendanceView } from './components/admin/AttendanceView';
import { TaskHistory } from './components/admin/TaskHistory';
import { ReportsView } from './components/admin/ReportsView';
import { AlertsConfigView } from './components/admin/AlertsConfigView';

// Client & Rider Views
import { ClientDashboard } from './components/client/ClientDashboard';
import { RiderDashboard } from './components/rider/RiderDashboard';

// Navigation Icons
import {
  LayoutDashboard,
  Building2,
  Bike,
  UserCheck,
  History,
  FileText,
  Sliders,
  MapPin
} from 'lucide-react';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current active section from location path
  const currentPath = location.pathname.toLowerCase();
  const currentRoute = currentPath.startsWith('/admin')
    ? 'admin'
    : currentPath.startsWith('/client')
    ? 'client'
    : currentPath.startsWith('/rider')
    ? 'rider'
    : 'landing';

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserAuth | null>(() => {
    try {
      return StorageService.getCurrentUser();
    } catch {
      return null;
    }
  });
  const [adminActiveTab, setAdminActiveTab] = useState<string>('dashboard');

  // Core domain data
  const [tasks, setTasks] = useState<PickupTask[]>(() => {
    try {
      return StorageService.getTasks();
    } catch {
      return [];
    }
  });
  const [clients, setClients] = useState<Client[]>(() => {
    try {
      return StorageService.getClients();
    } catch {
      return [];
    }
  });
  const [riders, setRiders] = useState<PickupBoy[]>(() => {
    try {
      return StorageService.getRiders();
    } catch {
      return [];
    }
  });
  const [routes, setRoutes] = useState<LogisticsRoute[]>(() => {
    try {
      return StorageService.getRoutes();
    } catch {
      return [];
    }
  });
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => {
    try {
      return StorageService.getAttendance();
    } catch {
      return [];
    }
  });
  const [notifications, setNotifications] = useState<NotificationLog[]>(() => {
    try {
      return NotificationService.getNotifications();
    } catch {
      return [];
    }
  });

  // Modals & Drawers
  const [selectedProofTask, setSelectedProofTask] = useState<PickupTask | null>(null);
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false);

  // Load / Reload all state from storage
  const reloadData = useCallback(() => {
    try {
      setTasks(StorageService.getTasks());
      setClients(StorageService.getClients());
      setRiders(StorageService.getRiders());
      setRoutes(StorageService.getRoutes());
      setAttendance(StorageService.getAttendance());
      setNotifications(NotificationService.getNotifications());
    } catch (err) {
      console.warn('Error reloading data:', err);
    }
  }, []);

  // Initial boot
  useEffect(() => {
    reloadData();
  }, [reloadData]);

  // Real-time Firestore synchronizer
  useEffect(() => {
    const unsubNotifs = NotificationService.subscribe(() => {
      setNotifications(NotificationService.getNotifications());
    });

    // Realtime Firestore Task sync
    const unsubCloudTasks = CloudSync.subscribeToCollection<PickupTask>('tasks', (cloudTasks) => {
      if (cloudTasks && cloudTasks.length > 0) {
        setTasks((prev) => {
          const taskMap = new Map<string, PickupTask>();
          prev.forEach((t) => taskMap.set(t.id, t));
          cloudTasks.forEach((t) => taskMap.set(t.id, t));
          const merged = Array.from(taskMap.values());
          try {
            localStorage.setItem('smvt_tasks', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    });

    // Realtime Firestore Attendance sync
    const unsubCloudAttendance = CloudSync.subscribeToCollection<AttendanceRecord>('attendance', (cloudAttendance) => {
      if (cloudAttendance && cloudAttendance.length > 0) {
        setAttendance((prev) => {
          const attMap = new Map<string, AttendanceRecord>();
          prev.forEach((a) => attMap.set(a.id, a));
          cloudAttendance.forEach((a) => attMap.set(a.id, a));
          const merged = Array.from(attMap.values());
          try {
            localStorage.setItem('smvt_attendance', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    });

    // Realtime Firestore Riders sync
    const unsubCloudRiders = CloudSync.subscribeToCollection<PickupBoy>('riders', (cloudRiders) => {
      if (cloudRiders && cloudRiders.length > 0) {
        setRiders((prev) => {
          const riderMap = new Map<string, PickupBoy>();
          prev.forEach((r) => riderMap.set(r.id, r));
          cloudRiders.forEach((r) => riderMap.set(r.id, r));
          const merged = Array.from(riderMap.values());
          try {
            localStorage.setItem('smvt_riders', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    });

    // Realtime Firestore Locations sync
    const unsubCloudLocations = CloudSync.subscribeToCollection<LocationPing>('locations', (cloudLocations) => {
      if (cloudLocations && cloudLocations.length > 0) {
        setRiders((prevRiders) => {
          return prevRiders.map((r) => {
            const latestPing = cloudLocations.find((p) => p.riderId === r.id);
            if (latestPing) {
              return {
                ...r,
                batteryLevel: latestPing.battery ?? r.batteryLevel,
                currentLocation: {
                  lat: latestPing.lat,
                  lng: latestPing.lng,
                  heading: latestPing.heading,
                  timestamp: latestPing.timestamp
                }
              };
            }
            return r;
          });
        });
      }
    });

    // Realtime Firestore Clients sync
    const unsubCloudClients = CloudSync.subscribeToCollection<Client>('clients', (cloudClients) => {
      if (cloudClients && cloudClients.length > 0) {
        setClients((prev) => {
          const clientMap = new Map<string, Client>();
          prev.forEach((c) => clientMap.set(c.id, c));
          cloudClients.forEach((c) => clientMap.set(c.id, c));
          const merged = Array.from(clientMap.values());
          try {
            localStorage.setItem('smvt_clients', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    });

    // Realtime Firestore Routes sync
    const unsubCloudRoutes = CloudSync.subscribeToCollection<LogisticsRoute>('routes', (cloudRoutes) => {
      if (cloudRoutes && cloudRoutes.length > 0) {
        setRoutes((prev) => {
          const routeMap = new Map<string, LogisticsRoute>();
          prev.forEach((r) => routeMap.set(r.id, r));
          cloudRoutes.forEach((r) => routeMap.set(r.id, r));
          const merged = Array.from(routeMap.values());
          try {
            localStorage.setItem('smvt_routes', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    });

    return () => {
      unsubNotifs();
      unsubCloudTasks();
      unsubCloudAttendance();
      unsubCloudRiders();
      unsubCloudLocations();
      unsubCloudClients();
      unsubCloudRoutes();
    };
  }, []);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        StorageService.setCurrentUser(null);
        setCurrentUser(null);
      }
    });

    return () => unsubAuth();
  }, []);

  // Handle Force Password Setup
  const handlePasswordChanged = (newPassword: string) => {
    if (currentUser) {
      const updatedUser: UserAuth = {
        ...currentUser,
        mustChangePassword: false
      };
      StorageService.setCurrentUser(updatedUser);
      setCurrentUser(updatedUser);
      reloadData();
    }
  };

  // Logout with Firebase signOut
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('[App] SignOut notice:', err);
    }
    StorageService.setCurrentUser(null);
    setCurrentUser(null);
    navigate('/');
  };

  // Toggle GPS Route Simulation
  const handleToggleSimulation = () => {
    if (isSimulating) {
      LocationService.stopSimulation();
      setIsSimulating(false);
    } else {
      const activeRider = riders.find((r) => r.status === 'active') || riders[0];
      if (activeRider) {
        LocationService.startSimulation(activeRider.id, activeRider.name, tasks[0]?.id);
        setIsSimulating(true);
      }
    }
  };

  // Open Proof Modal
  const handleOpenProof = (task: PickupTask) => {
    setSelectedProofTask(task);
    setIsProofModalOpen(true);
  };

  // Unread notifications count
  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  if (isLoading) {
    return <LoadingSkeleton rolePortal={currentUser?.role || (currentRoute !== 'landing' ? currentRoute : 'admin')} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-sky-600 selection:text-white">
      <Routes>
        {/* 1. STANDALONE LANDING PAGE (/) */}
        <Route
          path="/"
          element={
            <main className="flex-1 flex flex-col justify-center">
              <PortalLanding onSelectPortal={(portal) => navigate(`/${portal}`)} />
            </main>
          }
        />

        {/* 2. ADMIN PORTAL (/admin) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute
              requiredRole="admin"
              currentUser={currentUser}
              fallback={
                <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
                  <AdminLogin
                    onLoginSuccess={(user) => {
                      StorageService.setCurrentUser(user);
                      setCurrentUser(user);
                      reloadData();
                    }}
                    onBackToLanding={() => navigate('/')}
                  />
                </main>
              }
            >
              <AdminHeader
                user={currentUser}
                onLogout={handleLogout}
                unreadNotifsCount={unreadNotifsCount}
                onOpenNotifications={() => setIsNotifDrawerOpen(true)}
                isSimulating={isSimulating}
                onToggleSimulation={handleToggleSimulation}
              />

              <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
                <div className="space-y-5">
                  {/* Admin Navigation Tabs Bar */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1.5 border-b border-slate-200 text-xs no-scrollbar bg-slate-100/70 p-1 rounded-xl">
                    {[
                      { id: 'dashboard', label: 'Fleet & Live Ops', icon: LayoutDashboard },
                      { id: 'map', label: 'Mumbai Interactive Map', icon: MapPin },
                      { id: 'clients', label: 'Client Labs & Routes', icon: Building2 },
                      { id: 'riders', label: 'Pickup Boys', icon: Bike },
                      { id: 'attendance', label: 'Attendance Logs', icon: UserCheck },
                      { id: 'history', label: 'Chain of Custody', icon: History },
                      { id: 'reports', label: 'SLA & Billing', icon: FileText },
                      { id: 'alerts_config', label: 'Alerts & Rules', icon: Sliders }
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const isActive = adminActiveTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setAdminActiveTab(tab.id)}
                          className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer text-xs ${
                            isActive
                              ? 'bg-sky-700 text-white shadow-xs font-semibold'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Render Selected Admin View */}
                  {adminActiveTab === 'dashboard' && (
                    <AdminDashboard
                      tasks={tasks}
                      riders={riders}
                      routes={routes}
                      clients={clients}
                      notifications={notifications}
                      onOpenProof={handleOpenProof}
                      onRefresh={reloadData}
                      isSimulating={isSimulating}
                      onToggleSimulation={handleToggleSimulation}
                    />
                  )}

                  {adminActiveTab === 'map' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-sky-700" />
                            <span>Mumbai Diagnostic Logistics Map (Center: 19.0760° N, 72.8777° E)</span>
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Real-time Firestore GeoPoint tracking across BKC, Nerul, Andheri West, Dadar, Powai, and Vashi with area filters and route polylines.
                          </p>
                        </div>
                      </div>
                      <MumbaiMapDashboard
                        initialRiders={riders}
                        initialTasks={tasks}
                        initialClients={clients}
                        onOpenProof={handleOpenProof}
                        onRefreshData={reloadData}
                        height="650px"
                        showSidebarByDefault={true}
                      />
                    </div>
                  )}

                  {adminActiveTab === 'clients' && (
                    <ManageClients clients={clients} routes={routes} onRefresh={reloadData} />
                  )}

                  {adminActiveTab === 'riders' && (
                    <ManageRiders riders={riders} routes={routes} onRefresh={reloadData} />
                  )}

                  {adminActiveTab === 'attendance' && (
                    <AttendanceView attendance={attendance} riders={riders} onRefresh={reloadData} />
                  )}

                  {adminActiveTab === 'history' && (
                    <TaskHistory
                      tasks={tasks}
                      clients={clients}
                      riders={riders}
                      routes={routes}
                      onOpenProof={handleOpenProof}
                    />
                  )}

                  {adminActiveTab === 'reports' && (
                    <ReportsView tasks={tasks} riders={riders} clients={clients} />
                  )}

                  {adminActiveTab === 'alerts_config' && (
                    <AlertsConfigView onRefresh={reloadData} />
                  )}
                </div>
              </main>
            </ProtectedRoute>
          }
        />

        {/* 3. CLIENT PORTAL (/client) */}
        <Route
          path="/client"
          element={
            <ProtectedRoute
              requiredRole="client"
              currentUser={currentUser}
              fallback={
                <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
                  <ClientLogin
                    onLoginSuccess={(user) => {
                      StorageService.setCurrentUser(user);
                      setCurrentUser(user);
                      reloadData();
                    }}
                    onBackToLanding={() => navigate('/')}
                  />
                </main>
              }
            >
              <ClientHeader
                user={currentUser}
                onLogout={handleLogout}
                unreadNotifsCount={unreadNotifsCount}
                onOpenNotifications={() => setIsNotifDrawerOpen(true)}
              />

              <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
                <ClientDashboard
                  user={currentUser}
                  tasks={tasks}
                  routes={routes}
                  riders={riders}
                  onOpenProof={handleOpenProof}
                  onRefresh={reloadData}
                />
              </main>
            </ProtectedRoute>
          }
        />

        {/* 4. RIDER PORTAL (/rider) */}
        <Route
          path="/rider"
          element={
            <ProtectedRoute
              requiredRole="rider"
              currentUser={currentUser}
              fallback={
                <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
                  <RiderLogin
                    onLoginSuccess={(user) => {
                      StorageService.setCurrentUser(user);
                      setCurrentUser(user);
                      reloadData();
                    }}
                    onBackToLanding={() => navigate('/')}
                  />
                </main>
              }
            >
              <RiderHeader
                user={currentUser}
                rider={riders.find((r) => r.id === currentUser?.riderId) || riders[0]}
                onLogout={handleLogout}
                unreadNotifsCount={unreadNotifsCount}
                onOpenNotifications={() => setIsNotifDrawerOpen(true)}
              />

              <main className="flex-1 max-w-md md:max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
                <RiderDashboard
                  user={currentUser}
                  tasks={tasks}
                  routes={routes}
                  rider={riders.find((r) => r.id === currentUser?.riderId) || riders[0]}
                  onRefresh={reloadData}
                  onOpenProof={handleOpenProof}
                />
              </main>
            </ProtectedRoute>
          }
        />

        {/* 5. CATCH-ALL WILDCARD REDIRECT (redirects back cleanly to /) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Footer */}
      <Footer role={currentRoute !== 'landing' ? currentRoute : undefined} />

      {/* Force Password Change Modal for First-Time / Temporary Login */}
      {currentUser && currentUser.mustChangePassword && (
        <ForcePasswordModal
          user={currentUser}
          onPasswordChanged={handlePasswordChanged}
        />
      )}

      {/* Chain of Custody Proof Modal */}
      <ProofModal
        task={selectedProofTask}
        isOpen={isProofModalOpen}
        onClose={() => {
          setIsProofModalOpen(false);
          setSelectedProofTask(null);
        }}
      />

      {/* Real-time WhatsApp/SMS Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
        notifications={notifications}
        onMarkAllRead={() => {
          NotificationService.markAllAsRead();
          setNotifications(NotificationService.getNotifications());
        }}
        onClearAll={() => {
          NotificationService.clearAll();
          setNotifications([]);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
