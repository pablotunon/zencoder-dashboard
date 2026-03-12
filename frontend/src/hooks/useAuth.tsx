import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthContext, AuthUser, AuthOrg } from "@/types/auth";
import {
  apiGetMe,
  apiLogin,
  apiLogout,
  setAuthToken,
  setOnUnauthorized,
  setRefreshToken,
  setOnTokenRefreshed,
} from "@/api/client";

const TOKEN_KEY = "agenthub_token";
const REFRESH_TOKEN_KEY = "agenthub_refresh_token";
const USER_KEY = "agenthub_user";
const ORG_KEY = "agenthub_org";

const AuthCtx = createContext<AuthContext>({
  user: null,
  org: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [org, setOrg] = useState<AuthOrg | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount, validate via /auth/me
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const refreshTok = localStorage.getItem(REFRESH_TOKEN_KEY);
    const savedOrg = localStorage.getItem(ORG_KEY);

    if (!token || !savedOrg) {
      setIsLoading(false);
      return;
    }

    setAuthToken(token);
    setRefreshToken(refreshTok);

    apiGetMe()
      .then((freshUser) => {
        setUser(freshUser);
        setOrg(JSON.parse(savedOrg));
        localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
      })
      .catch(() => {
        setAuthToken(null);
        setRefreshToken(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(ORG_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setAuthToken(null);
    setRefreshToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ORG_KEY);
    setUser(null);
    setOrg(null);
  }, []);

  // Register the 401 handler so API client can trigger logout
  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
    });
    return () => setOnUnauthorized(null);
  }, [logout]);

  // Register token-refreshed handler to persist new tokens
  useEffect(() => {
    setOnTokenRefreshed((newToken: string, newRefreshToken: string) => {
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
    });
    return () => setOnTokenRefreshed(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    setAuthToken(response.token);
    setRefreshToken(response.refresh_token);
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    localStorage.setItem(ORG_KEY, JSON.stringify(response.org));
    setUser(response.user);
    setOrg(response.org);
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        user,
        org,
        isAuthenticated: !!user && !!org,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthContext {
  return useContext(AuthCtx);
}
