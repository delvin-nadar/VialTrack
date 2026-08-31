import React, { useState, useEffect } from 'react';
import { UserAuth, UserRole, PickupTask, Route, PickupBoy, Client, AttendanceRecord, NotificationLog, LocationPing } from './types';
import { StorageService } from './services/storage';
import { LocationService } from './services/locationService';
import { NotificationService } from './services/notificationService';
import { CloudSync, signInDemoAccount, DEMO_ACCOUNTS } from './services/firebase';

// Portals & Components
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { DemoSwitcher } from './components/common/DemoSwitcher';
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
  Bell,
  CheckCircle2,
  Laptop,
  Smartphone,
  MapPin
} from 'lucide-react';

export default function App() {
  // App state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserAuth | null>(() => {
    try {
      return StorageService.getCurrentUser();
    } catch {
      return null;
    }
  });
  const [activeRolePortal, setActiveRolePortal] = useState<UserRole>('admin');
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
  const [locationPings, setLocationPings] = useState<LocationPing[]>(() => {
    try {
      return StorageService.getPings();
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
  const reloadData = () => {
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
  };

  // Initial Boot with graceful StorageService hydration & hash-based routing
  useEffect(() => {
    reloadData();

    const parseRoleFromUrl = (): UserRole => {
      const urlStr = (window.location.pathname + window.location.hash + window.location.search).toLowerCase();
      if (urlStr.includes('client')) return 'client';
      if (urlStr.includes('rider')) return 'rider';
      return 'admin';
    };

    const initialRole = parseRoleFromUrl();
    handleSelectRole(initialRole);

    const handleHashOrUrlChange = () => {
      const currentRole = parseRoleFromUrl();
      setActiveRolePortal((prev) => {
        if (prev !== currentRole) {
          handleSelectRole(currentRole);
        }
        return currentRole;
      });
    };

    window.addEventListener('hashchange', handleHashOrUrlChange);
    window.addEventListener('popstate', handleHashOrUrlChange);

    return () => {
      window.removeEventListener('hashchange', handleHashOrUrlChange);
      window.removeEventListener('popstate', handleHashOrUrlChange);
    };
  }, []);

  // Dedicated Firestore real-time listener lifecycle:
  // ONLY attaches after authentication completes and is scoped to current user session
  useEffect(() => {
    const unsubNotifs = NotificationService.subscribe(() => {
      setNotifications(NotificationService.getNotifications());
    });

    if (!currentUser) {
      return () => unsubNotifs();
    }

    console.log(`[App] Initializing Firestore real-time listeners for role: ${currentUser.role} (${currentUser.email})...`);

    // Realtime Firestore Task sync across all devices
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

    // Realtime Firestore Attendance sync across all devices
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

    // Realtime Firestore Riders sync across all devices
    const unsubCloudRiders = CloudSync.subscribeToRiders((cloudRiders) => {
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

    // Realtime Firestore Locations sync across all devices
    const unsubCloudLocations = CloudSync.subscribeToLocations((cloudPings) => {
      if (cloudPings && cloudPings.length > 0) {
        setLocationPings((prev) => {
          const pingMap = new Map<string, LocationPing>();
          prev.forEach((p) => pingMap.set(p.id, p));
          cloudPings.forEach((p) => pingMap.set(p.id, p));
          const merged = Array.from(pingMap.values());
          try {
            localStorage.setItem('smvt_pings', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    });

    // Realtime Firestore Clients sync across all devices
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

    // Realtime Firestore Routes sync across all devices
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
  }, [currentUser?.id, currentUser?.role]);

  // Handle Role Switching from Portal Switcher - Authenticates with Firebase Auth
  const handleSelectRole = async (role: UserRole) => {
    setActiveRolePortal(role);
    setIsLoading(true);

    try {
      if (window.location.hash !== `#/${role}`) {
        window.history.replaceState(null, '', `#/${role}`);
      }
    } catch {}

    try {
      // 1. Authenticate to Firebase Auth for the target account
      const authUser = await signInDemoAccount(role);
      if (authUser) {
        console.log(`[App] Authenticated to Firebase Auth as ${authUser.email} (role: ${role})`);
      }

      const clientsList = StorageService.getClients();
      const ridersList = StorageService.getRiders();

      let appUser: UserAuth;
      if (role === 'admin') {
        appUser = {
          id: 'user-admin-1',
          email: DEMO_ACCOUNTS.admin.email,
          name: DEMO_ACCOUNTS.admin.displayName,
          role: 'admin'
        };
      } else if (role === 'client') {
        const client = clientsList[0] || {
          id: 'client-apex',
          name: 'Apex Diagnostic Centre Andheri West',
          contactPerson: 'Dr. Sunita Rao (Ops Head)',
          phone: '+91 98200 33445',
          email: DEMO_ACCOUNTS.client.email,
          address: 'Plot 42, S.V. Road, Malad West, Mumbai',
          active: true,
          createdAt: '2026-01-15T09:00:00Z'
        };
        appUser = {
          id: `user-${client.id}`,
          email: DEMO_ACCOUNTS.client.email,
          name: `${client.name} (Lab Ops)`,
          role: 'client',
          clientId: client.id,
          phone: client.phone
        };
      } else {
        const rider = ridersList[0] || {
          id: 'rider-rahul',
          name: 'Rahul Sharma',
          email: DEMO_ACCOUNTS.rider.email,
          phone: '+91 98765 43210',
          photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80',
          vehicleNumber: 'MH-02-DN-4921',
          vehicleType: 'Hero Splendor Plus',
          assignedRouteIds: ['route-andheri-west-1'],
          status: 'active' as const,
          joiningDate: '2025-11-10',
          isOnline: true,
          isCheckedIn: true
        };
        appUser = {
          id: `user-${rider.id}`,
          email: DEMO_ACCOUNTS.rider.email,
          name: rider.name,
          role: 'rider',
          riderId: rider.id,
          phone: rider.phone,
          avatar: rider.photoUrl
        };
      }

      StorageService.setCurrentUser(appUser);
      setCurrentUser(appUser);

      // 2. Sync existing local tasks, attendance, and riders to Firestore under this authenticated session
      const currentTasks = StorageService.getTasks();
      if (currentTasks.length > 0) {
        await CloudSync.syncCollection('tasks', currentTasks);
      }
      const currentAttendance = StorageService.getAttendance();
      if (currentAttendance.length > 0) {
        await CloudSync.syncCollection('attendance', currentAttendance);
      }
      const currentRiders = StorageService.getRiders();
      if (currentRiders.length > 0) {
        await CloudSync.syncCollection('riders', currentRiders);
      }
    } catch (authError) {
      console.error('[App] Failed to authenticate user with Firebase Auth:', authError);
    } finally {
      setIsLoading(false);
      reloadData();
    }
  };

  // Reset Operations Data
  const handleResetData = () => {
    if (window.confirm('Reset operational tasks, attendance logs, and alerts back to default pristine state?')) {
      StorageService.resetToDefaults();
      reloadData();
      alert('Operational data has been restored to default configuration.');
    }
  };

  // Logout
  const handleLogout = () => {
    StorageService.setCurrentUser(null);
    setCurrentUser(null);
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
    return <LoadingSkeleton rolePortal={currentUser?.role || activeRolePortal} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-sky-600 selection:text-white">
      {/* Top Testing Demo Switcher Bar */}
      <DemoSwitcher
        currentRole={currentUser?.role || activeRolePortal}
        onSelectRole={handleSelectRole}
        onResetData={handleResetData}
      />

      {/* App Header (when logged in) */}
      {currentUser && (
        <Header
          user={currentUser}
          onLogout={handleLogout}
          unreadNotifsCount={unreadNotifsCount}
          onOpenNotifications={() => setIsNotifDrawerOpen(true)}
          isSimulating={isSimulating}
          onToggleSimulation={handleToggleSimulation}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        {/* NOT LOGGED IN: Render Dedicated Login Screen for selected Portal */}
        {!currentUser && (
          <div>
            {activeRolePortal === 'admin' && (
              <AdminLogin
                onLoginSuccess={(user) => {
                  StorageService.setCurrentUser(user);
                  setCurrentUser(user);
                  reloadData();
                }}
              />
            )}

            {activeRolePortal === 'client' && (
              <ClientLogin
                onLoginSuccess={(user) => {
                  StorageService.setCurrentUser(user);
                  setCurrentUser(user);
                  reloadData();
                }}
              />
            )}

            {activeRolePortal === 'rider' && (
              <RiderLogin
                onLoginSuccess={(user) => {
                  StorageService.setCurrentUser(user);
                  setCurrentUser(user);
                  reloadData();
                }}
              />
            )}
          </div>
        )}

        {/* LOGGED IN PORTALS */}
        {currentUser && (
          <div>
            {/* 1. ADMIN PORTAL */}
            {currentUser.role === 'admin' && (
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
            )}

            {/* 2. CLIENT PORTAL */}
            {currentUser.role === 'client' && (
              <ClientDashboard
                user={currentUser}
                tasks={tasks}
                routes={routes}
                riders={riders}
                onOpenProof={handleOpenProof}
                onRefresh={reloadData}
              />
            )}

            {/* 3. RIDER / PICKUP BOY PORTAL */}
            {currentUser.role === 'rider' && (
              <RiderDashboard
                user={currentUser}
                tasks={tasks}
                routes={routes}
                rider={riders.find((r) => r.id === currentUser.riderId) || riders[0]}
                onRefresh={reloadData}
                onOpenProof={handleOpenProof}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer role={currentUser?.role || activeRolePortal} />

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
