import { describe, it, expect } from "vitest";
import {
  ORGS,
  generateUsers,
  generateProjects,
} from "../generators/org.js";

describe("Org generation", () => {
  const org = ORGS[0];

  it("should define Acme Corp with 5 teams", () => {
    expect(org.id).toBe("org_acme");
    expect(org.name).toBe("Acme Corp");
    expect(org.plan).toBe("enterprise");
    expect(org.monthly_budget).toBe(50000);
    expect(org.teams).toHaveLength(5);
  });

  it("should have team sizes totaling 50 users", () => {
    const totalSize = org.teams.reduce((sum, t) => sum + t.size, 0);
    expect(totalSize).toBe(50);
  });
});

describe("User generation", () => {
  const org = ORGS[0];
  const users = generateUsers(org, 42);

  it("should generate 50 users", () => {
    expect(users).toHaveLength(50);
  });

  it("should assign all users to org_acme", () => {
    for (const user of users) {
      expect(user.org_id).toBe("org_acme");
    }
  });

  it("should have exactly 1 admin", () => {
    const admins = users.filter((u) => u.role === "admin");
    expect(admins).toHaveLength(1);
  });

  it("should have team_leads for each team", () => {
    const leads = users.filter((u) => u.role === "team_lead");
    // First user is admin (not team_lead), but first of each subsequent team is
    // So 4 team_leads (teams 2-5, since first team's first user is the admin)
    expect(leads.length).toBeGreaterThanOrEqual(4);
  });

  it("should distribute users across teams according to team sizes", () => {
    for (const team of org.teams) {
      const teamUsers = users.filter((u) => u.team_id === team.id);
      expect(teamUsers).toHaveLength(team.size);
    }
  });

  it("should generate unique user IDs", () => {
    const ids = new Set(users.map((u) => u.user_id));
    expect(ids.size).toBe(users.length);
  });

  it("should generate unique emails within the org", () => {
    const emails = new Set(users.map((u) => u.email));
    expect(emails.size).toBe(users.length);
  });
});

describe("Project generation", () => {
  const org = ORGS[0];
  const projects = generateProjects(org);

  it("should generate 10 projects", () => {
    expect(projects).toHaveLength(10);
  });

  it("should assign all projects to org_acme", () => {
    for (const project of projects) {
      expect(project.org_id).toBe("org_acme");
    }
  });

  it("should distribute projects across teams", () => {
    const teamIds = new Set(projects.map((p) => p.team_id));
    expect(teamIds.size).toBe(org.teams.length);
  });

  it("should generate unique project IDs", () => {
    const ids = new Set(projects.map((p) => p.project_id));
    expect(ids.size).toBe(projects.length);
  });

  it("should have repository URLs", () => {
    for (const project of projects) {
      expect(project.repository_url).toMatch(/^https:\/\/github\.com\//);
    }
  });
});
