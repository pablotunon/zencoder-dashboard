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
  apiLogin,
  apiLogout,
  setAuthToken,
  setOnUnauthorized,
} from "@/api/client";

const TOKEN_KEY = "agenthub_token";
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

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    const savedOrg = localStorage.getItem(ORG_KEY);

    if (token && savedUser && savedOrg) {
      try {
        setUser(JSON.parse(savedUser));
        setOrg(JSON.parse(savedOrg));
        setAuthToken(token);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(ORG_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setAuthToken(null);
    localStorage.removeItem(TOKEN_KEY);
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

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    setAuthToken(response.token);
    localStorage.setItem(TOKEN_KEY, response.token);
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
