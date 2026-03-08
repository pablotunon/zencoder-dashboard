import { createContext, useContext, type ReactNode } from "react";
import type { AuthContext } from "@/types/auth";

// Phase A: Hardcoded stub context
const STUB_CONTEXT: AuthContext = {
  user: {
    user_id: "user_admin",
    name: "Admin User",
    email: "admin@acme.corp",
    role: "admin",
  },
  org: {
    org_id: "org_acme",
    name: "Acme Corp",
    plan: "enterprise",
  },
  isAuthenticated: true,
};

const AuthCtx = createContext<AuthContext>(STUB_CONTEXT);

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthCtx.Provider value={STUB_CONTEXT}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContext {
  return useContext(AuthCtx);
}
