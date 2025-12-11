import { createContext, useContext, useMemo, useState, useEffect, ReactNode } from 'react';
import { useCookie } from 'react-use';
import { MemberRole, API_ROUTE } from '../utils/constants';
import api from '../utils/api';
import { useRouter } from 'next/router';
import { removeToken } from '../utils/auth';

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
  // Snapshot from cookie created at login
  const [userCookie, setUserCookie] = useCookie('plnadmin_user');
  const [authToken] = useCookie('plnadmin');

  const [isLoading, setIsLoading] = useState(true);
  const [userFromApi, setUserFromApi] = useState<AdminUser | null>(null);

  const router = useRouter();

  // User from cookie (old behavior, preserved)
  const user = useMemo<AdminUser | null>(() => {
    if (!userCookie) return null;
    try {
      return JSON.parse(userCookie);
    } catch {
      return null;
    }
  }, [userCookie]);

  // Mark initial loading as done (we don't block UI on API call)
  useEffect(() => {
    setIsLoading(false);
  }, []);

  // Reload member from backend by uid to keep roles in sync with DB
  useEffect(() => {
    // If we don't have a logged in user or token — nothing to do
    if (!user?.uid || !authToken) {
      setUserFromApi(null);
      return;
    }

    api
      .get(`${API_ROUTE.ADMIN_MEMBERS}/${user.uid}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })
      .then((response) => {
        const apiUser = response.data as any;

        // Backend returns memberRoles: [{ uid, name, ... }]
        const mappedRoles: string[] = Array.isArray(apiUser.memberRoles)
          ? apiUser.memberRoles
            .map((role: any) => role?.name)
            .filter((name: unknown): name is string => typeof name === 'string')
          : [];

        const mergedUser: AdminUser = {
          uid: apiUser.uid,
          email: apiUser.email,
          name: apiUser.name,
          roles: mappedRoles,
        };

        console.log('[AuthContext] Loaded user from API:', mergedUser);
        setUserFromApi(mergedUser);
      })
      .catch((error) => {
        console.error('[AuthContext] Failed to load user from API:', error);

        // If token is invalid — logout
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          removeToken();
          setUserCookie(undefined);
          router.replace('/');
        } else {
          setUserFromApi(null);
        }
      });
  }, [user?.uid, authToken, router, setUserCookie]);

  // Prefer user from API (fresh roles), fallback to cookie-based user
  const resolvedUser = useMemo<AdminUser | null>(() => {
    return userFromApi || user;
  }, [userFromApi, user]);

  // Debug logs for resolved user and roles
  useEffect(() => {
    console.log('[AuthContext] Resolved user =', resolvedUser);
    console.log('[AuthContext] Resolved user roles =', resolvedUser?.roles);
  }, [resolvedUser]);

  // Auto logout when user has no roles (NONE)
  useEffect(() => {
    if (resolvedUser && Array.isArray(resolvedUser.roles) && resolvedUser.roles.length === 0) {
      console.log('[AuthContext] User has no roles (NONE). Logging out.');

      removeToken();
      setUserCookie(undefined);
      router.replace('/');
    }
  }, [resolvedUser, router, setUserCookie]);

  const hasRole = useMemo(
    () =>
      (role: string): boolean => {
        return resolvedUser?.roles?.includes(role) ?? false;
      },
    [resolvedUser]
  );

  const isDirectoryAdmin = hasRole(MemberRole.DIRECTORY_ADMIN);
  const isDemoDayAdmin = hasRole(MemberRole.DEMO_DAY_ADMIN);

  const value = useMemo(
    () => ({
      user: resolvedUser,
      isDirectoryAdmin,
      isDemoDayAdmin,
      isLoading,
      hasRole,
    }),
    [resolvedUser, isDirectoryAdmin, isDemoDayAdmin, isLoading, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
