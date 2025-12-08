import { createContext, useContext, useMemo, useState, useEffect, ReactNode } from 'react';
import { useCookie } from 'react-use';

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  roles: string[];
}

interface AuthContextValue {
  user: AdminUser | null;
  isDirectoryAdmin: boolean;
  isDemoDayAdmin: boolean;
  isLoading: boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isDirectoryAdmin: false,
  isDemoDayAdmin: false,
  isLoading: true,
  hasRole: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userCookie] = useCookie('plnadmin_user');
  const [isLoading, setIsLoading] = useState(true);

  const user = useMemo<AdminUser | null>(() => {
    if (!userCookie) return null;
    try {
      return JSON.parse(userCookie);
    } catch {
      return null;
    }
  }, [userCookie]);

  // Set loading to false after the first render (cookie should be available)
  useEffect(() => {
    setIsLoading(false);
  }, []);

  const hasRole = useMemo(
    () => (role: string): boolean => {
      return user?.roles?.includes(role) ?? false;
    },
    [user]
  );

  const isDirectoryAdmin = hasRole('DIRECTORYADMIN');
  const isDemoDayAdmin = hasRole('DEMO_DAY_ADMIN');

  const value = useMemo(
    () => ({
      user,
      isDirectoryAdmin,
      isDemoDayAdmin,
      isLoading,
      hasRole,
    }),
    [user, isDirectoryAdmin, isDemoDayAdmin, isLoading, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
