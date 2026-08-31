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
