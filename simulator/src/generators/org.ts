import { faker } from "@faker-js/faker";

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
}

export interface ProjectRecord {
  project_id: string;
  org_id: string;
  team_id: string;
  name: string;
  repository_url: string;
}

// Phase A: single org definition
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

  for (const team of org.teams) {
    for (let i = 0; i < team.size; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const userIndex = users.length;

      let role: "admin" | "team_lead" | "viewer" = "viewer";
      if (userIndex === 0) {
        role = "admin"; // First user is always admin
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
