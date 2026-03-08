import type { UserRole } from "./api";

export interface AuthUser {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
}

export interface AuthOrg {
  org_id: string;
  name: string;
  plan: string;
}

export interface AuthContext {
  user: AuthUser;
  org: AuthOrg;
  isAuthenticated: boolean;
}
