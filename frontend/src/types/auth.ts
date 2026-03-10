import type { UserRole } from "./api";

export interface AuthUser {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  team_id?: string;
}

export interface AuthOrg {
  org_id: string;
  name: string;
  plan: string;
}

export interface AuthContext {
  user: AuthUser | null;
  org: AuthOrg | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
