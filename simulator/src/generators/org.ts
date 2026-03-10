import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";

export interface OrgDefinition {
  id: string;
  name: string;
  plan: string;
  monthly_budget: number;
  teams: TeamDefinition[];
}

export interface TeamDefinition {
  id: string;
  name: string;
  slug: string;
  size: number;
}

export interface UserRecord {
  user_id: string;
  org_id: string;
  team_id: string;
  name: string;
  email: string;
  avatar_url: string;
  role: "admin" | "team_lead" | "viewer";
  is_active: boolean;
  password_hash: string;
}

export interface ProjectRecord {
  project_id: string;
  org_id: string;
  team_id: string;
  name: string;
  repository_url: string;
}

export interface ApiKeyRecord {
  api_key_id: string;
  org_id: string;
  key_hash: string;
  name: string;
  is_active: boolean;
  plain_key: string; // for logging/dev only, not stored in DB
}

export const ORGS: OrgDefinition[] = [
  {
    id: "org_acme",
    name: "Acme Corp",
    plan: "enterprise",
    monthly_budget: 50000,
    teams: [
      { id: "team_platform", name: "Platform", slug: "platform", size: 15 },
      { id: "team_backend", name: "Backend", slug: "backend", size: 12 },
      { id: "team_frontend", name: "Frontend", slug: "frontend", size: 8 },
      { id: "team_data", name: "Data Engineering", slug: "data", size: 10 },
      { id: "team_mobile", name: "Mobile", slug: "mobile", size: 5 },
    ],
  },
  {
    id: "org_globex",
    name: "Globex Corporation",
    plan: "business",
    monthly_budget: 20000,
    teams: [
      { id: "team_globex_eng", name: "Engineering", slug: "engineering", size: 10 },
      { id: "team_globex_product", name: "Product", slug: "product", size: 6 },
      { id: "team_globex_devops", name: "DevOps", slug: "devops", size: 4 },
    ],
  },
];

const PROJECT_NAMES = [
  "api-gateway",
  "web-dashboard",
  "data-pipeline",
  "mobile-app",
  "auth-service",
  "billing-engine",
  "notification-hub",
  "search-indexer",
  "ml-platform",
  "infra-automation",
];

/**
 * Generate users deterministically using a seeded faker instance.
 */
export function generateUsers(org: OrgDefinition, seed: number): UserRecord[] {
  const seeded = faker.seed(seed);
  const users: UserRecord[] = [];

  // Add well-known demo users for each org
  const wellKnownPasswordHash = bcrypt.hashSync("pass", 10);
  if (org.id === "org_acme") {
    users.push({
      user_id: "user",
      org_id: "org_acme",
      team_id: "team_platform",
      name: "Demo User",
      email: "user@acmecorp.com",
      avatar_url: "https://i.pravatar.cc/150?u=user",
      role: "admin",
      is_active: true,
      password_hash: wellKnownPasswordHash,
    });
  } else if (org.id === "org_globex") {
    users.push({
      user_id: "user_globex_admin",
      org_id: "org_globex",
      team_id: "team_globex_eng",
      name: "Globex Admin",
      email: "admin@globexcorporation.com",
      avatar_url: "https://i.pravatar.cc/150?u=globex_admin",
      role: "admin",
      is_active: true,
      password_hash: wellKnownPasswordHash,
    });
  }

  // Hash the password for regular users (demo123)
  const defaultPasswordHash = bcrypt.hashSync("demo123", 10);

  for (const team of org.teams) {
    for (let i = 0; i < team.size; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const userIndex = users.length;

      let role: "admin" | "team_lead" | "viewer" = "viewer";
      if (userIndex === 0 && org.id !== "org_acme") {
        // First user is admin for orgs without the well-known user
        role = "admin";
      } else if (i === 0) {
        role = "team_lead"; // First user in each team is team_lead
      }

      users.push({
        user_id: `user_${org.id}_${userIndex.toString().padStart(3, "0")}`,
        org_id: org.id,
        team_id: team.id,
        name: `${firstName} ${lastName}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${org.name.toLowerCase().replace(/\s+/g, "")}.com`,
        avatar_url: `https://i.pravatar.cc/150?u=${org.id}_${userIndex}`,
        role,
        is_active: true,
        password_hash: defaultPasswordHash,
      });
    }
  }

  // Reset faker seed
  faker.seed();

  return users;
}

/**
 * Generate projects deterministically. Each project belongs to a team (round-robin).
 */
export function generateProjects(org: OrgDefinition): ProjectRecord[] {
  return PROJECT_NAMES.map((name, i) => {
    const team = org.teams[i % org.teams.length];
    return {
      project_id: `proj_${org.id}_${i.toString().padStart(2, "0")}`,
      org_id: org.id,
      team_id: team.id,
      name,
      repository_url: `https://github.com/${org.name.toLowerCase().replace(/\s+/g, "-")}/${name}`,
    };
  });
}

/**
 * Generate deterministic API keys for an org.
 * Keys use a known prefix for dev environments.
 */
export function generateApiKeys(org: OrgDefinition): ApiKeyRecord[] {
  const orgShort = org.id.replace("org_", "");
  const keys: ApiKeyRecord[] = [];

  for (let i = 0; i < 2; i++) {
    const plainKey = `ak_${orgShort}_${(i + 1).toString().padStart(3, "0")}`;
    keys.push({
      api_key_id: `apikey_${orgShort}_${(i + 1).toString().padStart(3, "0")}`,
      org_id: org.id,
      key_hash: bcrypt.hashSync(plainKey, 10),
      name: i === 0 ? "Production Key" : "Staging Key",
      is_active: true,
      plain_key: plainKey,
    });
  }

  return keys;
}
