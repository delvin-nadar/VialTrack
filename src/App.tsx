import React, { useState, useEffect, useCallback } from 'react';
import { UserAuth, UserRole, PickupTask, Route, PickupBoy, Client, AttendanceRecord, NotificationLog, LocationPing } from './types';
import { StorageService } from './services/storage';
import { LocationService } from './services/locationService';
import { NotificationService } from './services/notificationService';
import { CloudSync } from './services/firebase';

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

// Auth
import { AdminLogin } from './components/auth/AdminLogin';
import { ClientLogin } from './components/auth/ClientLogin';
import { RiderLogin } from './components/auth/RiderLogin';

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

type AppRoute = 'landing' | 'admin' | 'client' | 'rider';

export default function App() {
  // App state
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('landing');
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
  const [routes, setRoutes] = useState<Route[]>(() => {
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

  // Parse URL/Hash to determine current route
  const parseRoute = (): AppRoute => {
    const raw = (window.location.hash + window.location.pathname + window.location.search).toLowerCase();
    if (raw.includes('admin')) return 'admin';
    if (raw.includes('client')) return 'client';
    if (raw.includes('rider')) return 'rider';
    return 'landing';
  };

  // Navigate to target portal route
  const navigateTo = (targetRoute: AppRoute) => {
    setCurrentRoute(targetRoute);
    if (targetRoute === 'landing') {
      window.location.hash = '#/';
    } else {
      window.location.hash = `#/${targetRoute}`;
    }
  };

  // Initial Boot with graceful StorageService hydration & hash-based routing
  useEffect(() => {
    reloadData();
    const initialRoute = parseRoute();
    setCurrentRoute(initialRoute);

    const handleHashOrUrlChange = () => {
      const updatedRoute = parseRoute();
      setCurrentRoute(updatedRoute);
    };

    window.addEventListener('hashchange', handleHashOrUrlChange);
    window.addEventListener('popstate', handleHashOrUrlChange);

    return () => {
      window.removeEventListener('hashchange', handleHashOrUrlChange);
      window.removeEventListener('popstate', handleHashOrUrlChange);
    };
  }, [reloadData]);

  // Real-time Firestore synchronizer
  useEffect(() => {
    const unsubNotifs = NotificationService.subscribe(() => {
      setNotifications(NotificationService.getNotifications());
    });

    if (!currentUser) {
      return () => unsubNotifs();
    }

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
    const unsubCloudRoutes = CloudSync.subscribeToCollection<Route>('routes', (cloudRoutes) => {
      if (cloudRoutes && cloudRoutes.length > 0) {
        setRoutes((prev) => {
          const routeMap = new Map<string, Route>();
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
  }, [currentUser]);

  // Logout
  const handleLogout = () => {
    StorageService.setCurrentUser(null);
    setCurrentUser(null);
    navigateTo('landing');
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
      {/* 1. STANDALONE LANDING PAGE (/) */}
      {currentRoute === 'landing' && (
        <main className="flex-1 flex flex-col justify-center">
          <PortalLanding onSelectPortal={(portal) => navigateTo(portal)} />
        </main>
      )}

      {/* 2. ADMIN PORTAL (/admin) */}
      {currentRoute === 'admin' && (
        <>
          {/* Admin Login if not authenticated as admin */}
          {(!currentUser || currentUser.role !== 'admin') && (
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <AdminLogin
                onLoginSuccess={(user) => {
                  StorageService.setCurrentUser(user);
                  setCurrentUser(user);
                  reloadData();
                }}
                onBackToLanding={() => navigateTo('landing')}
              />
            </main>
          )}

          {/* Admin Dashboard & Management views if logged in */}
          {currentUser && currentUser.role === 'admin' && (
            <>
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
            </>
          )}
        </>
      )}

      {/* 3. CLIENT PORTAL (/client) */}
      {currentRoute === 'client' && (
        <>
          {/* Client Login if not authenticated as client */}
          {(!currentUser || currentUser.role !== 'client') && (
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <ClientLogin
                onLoginSuccess={(user) => {
                  StorageService.setCurrentUser(user);
                  setCurrentUser(user);
                  reloadData();
                }}
                onBackToLanding={() => navigateTo('landing')}
              />
            </main>
          )}

          {/* Client Dashboard if logged in */}
          {currentUser && currentUser.role === 'client' && (
            <>
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
            </>
          )}
        </>
      )}

      {/* 4. RIDER PORTAL (/rider) */}
      {currentRoute === 'rider' && (
        <>
          {/* Rider Login if not authenticated as rider */}
          {(!currentUser || currentUser.role !== 'rider') && (
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <RiderLogin
                onLoginSuccess={(user) => {
                  StorageService.setCurrentUser(user);
                  setCurrentUser(user);
                  reloadData();
                }}
                onBackToLanding={() => navigateTo('landing')}
              />
            </main>
          )}

          {/* Rider Dashboard if logged in */}
          {currentUser && currentUser.role === 'rider' && (
            <>
              <RiderHeader
                user={currentUser}
                rider={riders.find((r) => r.id === currentUser.riderId) || riders[0]}
                onLogout={handleLogout}
                unreadNotifsCount={unreadNotifsCount}
                onOpenNotifications={() => setIsNotifDrawerOpen(true)}
              />

              <main className="flex-1 max-w-md md:max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
                <RiderDashboard
                  user={currentUser}
                  tasks={tasks}
                  routes={routes}
                  rider={riders.find((r) => r.id === currentUser.riderId) || riders[0]}
                  onRefresh={reloadData}
                  onOpenProof={handleOpenProof}
                />
              </main>
            </>
          )}
        </>
      )}

      {/* Footer */}
      <Footer role={currentRoute !== 'landing' ? currentRoute : undefined} />

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
