import { createContext, useContext, useMemo, useState, useEffect, ReactNode } from 'react';
import { useCookie } from 'react-use';
import { API_ROUTE, ADMIN_PERMISSIONS, DEMODAY_PERMISSIONS } from '../utils/constants';
import api from '../utils/api';
import { useRouter } from 'next/router';
import { removeToken } from '../utils/auth';

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  roles: string[];
  permissions?: string[];
  effectivePermissionCodes?: string[];
}

interface AuthContextValue {
  user: AdminUser | null;
  isDirectoryAdmin: boolean;
  isDemoDayAdmin: boolean;
  isBackOfficeUser: boolean;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  isLoading: boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isDirectoryAdmin: false,
  isDemoDayAdmin: false,
  isBackOfficeUser: false,
  permissions: [],
  hasPermission: () => false,
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

  // User from cookie created at login. It contains RBAC v2 permissions from JWT.
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

        const apiPermissionCodes = apiUser.effectivePermissionCodes ?? apiUser.permissionCodes ?? [];
        const cookiePermissionCodes = user.effectivePermissionCodes ?? user.permissions ?? [];
        const permissionCodes = apiPermissionCodes.length > 0 ? apiPermissionCodes : cookiePermissionCodes;

        const mergedUser: AdminUser = {
          uid: apiUser.uid ?? user.uid,
          email: apiUser.email ?? user.email,
          name: apiUser.name ?? user.name,
          roles: mappedRoles.length > 0 ? mappedRoles : user.roles ?? [],
          permissions: permissionCodes,
          effectivePermissionCodes: permissionCodes,
        };

        console.log('[AuthContext] Loaded user from API:', mergedUser);
        setUserFromApi(mergedUser);
      })
      .catch((error) => {
        console.error('[AuthContext] Failed to load user from API:', error);

        // Only an invalid/expired token should force logout.
        // A 403 here must not log out a permission-based admin: the cookie/JWT
        // already contains the effectivePermissionCodes needed by the UI.
        if (error?.response?.status === 401) {
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


  const hasRole = useMemo(
    () =>
      (role: string): boolean => {
        return resolvedUser?.roles?.includes(role) ?? false;
      },
    [resolvedUser]
  );

  const permissions = resolvedUser?.effectivePermissionCodes ?? resolvedUser?.permissions ?? [];
  const hasPermission = (permission: string): boolean => permissions.includes(permission);

  // RBAC v2: page access is driven by effective permissions, not legacy MemberRole rows.
  const isDirectoryAdmin = hasPermission(ADMIN_PERMISSIONS.DIRECTORY_FULL);
  const isBackOfficeUser = isDirectoryAdmin || hasPermission(ADMIN_PERMISSIONS.TOOLS_ACCESS);
  const isDemoDayAdmin =
    isDirectoryAdmin ||
    hasPermission(DEMODAY_PERMISSIONS.ADMIN_ALL) ||
    permissions.some((permission) => permission.startsWith('demoday.admin.'));

  const value = useMemo(
    () => ({
      user: resolvedUser,
      isDirectoryAdmin,
      isDemoDayAdmin,
      isBackOfficeUser: isBackOfficeUser || isDemoDayAdmin,
      isLoading,
      permissions,
      hasPermission,
      hasRole,
    }),
    [resolvedUser, isDirectoryAdmin, isDemoDayAdmin, isBackOfficeUser, isLoading, hasRole, permissions]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
