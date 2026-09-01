import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { UserRole } from '../../types';
import { StorageService } from '../../services/storage';

interface ProtectedRouteProps {
  requiredRole: UserRole;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Strict Role-Based Route Guard:
 * Validates the portal-specific session storage (vialtrack_admin_session, vialtrack_client_session, vialtrack_rider_session).
 * If the active session does not match requiredRole, redirects immediately to /{role}/login.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredRole,
  children,
  fallback
}) => {
  const location = useLocation();
  const activeSession = StorageService.getPortalSession(requiredRole);

  const isValidSession =
    Boolean(activeSession) &&
    activeSession?.role === requiredRole &&
    (requiredRole !== 'client' || Boolean(activeSession?.clientId)) &&
    (requiredRole !== 'rider' || Boolean(activeSession?.riderId));

  if (!isValidSession) {
    // Clear potentially corrupted or incomplete session
    StorageService.clearPortalSession(requiredRole);
    if (fallback) {
      return <>{fallback}</>;
    }
    return <Navigate to={`/${requiredRole}/login`} state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

/**
 * AdminRoute:
 * Only allows access to /admin if logged in as admin.
 * If a phlebotomist/rider accesses this route, automatically redirects them to /rider.
 * If a client accesses this, redirects to /client.
 */
export const AdminRoute: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
  children,
  fallback
}) => {
  const adminSession = StorageService.getAdminSession();
  const riderSession = StorageService.getRiderSession();
  const clientSession = StorageService.getClientSession();
  const storedRole = typeof window !== 'undefined' ? localStorage.getItem('vialtrack_role') : null;

  // Strict redirection if another role is logged in
  if (!adminSession && (storedRole === 'rider' || (riderSession && !adminSession))) {
    return <Navigate to="/rider" replace />;
  }
  if (!adminSession && (storedRole === 'client' || (clientSession && !adminSession))) {
    return <Navigate to="/client" replace />;
  }

  if (!adminSession || adminSession.role !== 'admin') {
    StorageService.clearPortalSession('admin');
    if (fallback) return <>{fallback}</>;
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
};

/**
 * RiderRoute:
 * For phlebotomists logged into /rider.
 * Protects rider portal and redirects unauthenticated users to /rider/login.
 */
export const RiderRoute: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
  children,
  fallback
}) => {
  // ✅ USE LIVE AUTH SESSION ONLY:
useEffect(() => {
  const currentSession = StorageService.getRiderSession();
  if (!currentSession) {
    navigate('/rider/login');
    return;
  }
  
  // Listen to the authenticated rider's tasks only
  const q = query(
    collection(db, 'tasks'),
    where('riderId', '==', currentSession.riderId)
  );
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => formatUnifiedTask(doc.id, doc.data()));
    setMyTasks(tasks);
  });

  return () => unsubscribe();
}, []);

/**
 * ClientRoute:
 * For diagnostic labs logged into /client.
 * Protects client portal and redirects unauthenticated users to /client/login.
 */
export const ClientRoute: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
  children,
  fallback
}) => {
  const clientSession = StorageService.getClientSession();
  const isValid = Boolean(clientSession && clientSession.role === 'client' && clientSession.clientId);

  if (!isValid) {
    StorageService.clearPortalSession('client');
    if (fallback) return <>{fallback}</>;
    return <Navigate to="/client/login" replace />;
  }

  return <>{children}</>;
};
