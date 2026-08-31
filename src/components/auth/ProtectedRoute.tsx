import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { UserAuth, UserRole } from '../../types';
import { LoadingSkeleton } from '../common/LoadingSkeleton';

interface ProtectedRouteProps {
  requiredRole: UserRole;
  currentUser: UserAuth | null;
  children: React.ReactNode;
  fallback: React.ReactNode;
}

/**
 * Strict Route Protection Component:
 * Checks for an active Firebase currentUser session via onAuthStateChanged
 * before granting access to protected routes (/admin, /client, /rider).
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredRole,
  currentUser,
  children,
  fallback
}) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [authInitializing, setAuthInitializing] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  // Show loading skeleton while Firebase Auth verifies session state
  if (authInitializing) {
    return <LoadingSkeleton rolePortal={requiredRole} />;
  }

  // Strict check: Must have an active Firebase currentUser AND a valid matching role
  if (!firebaseUser || !currentUser || currentUser.role !== requiredRole) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
