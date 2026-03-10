import { describe, it, expect } from "vitest";
import {
  ORGS,
  generateUsers,
  generateProjects,
  generateApiKeys,
} from "../generators/org.js";

describe("Org definitions", () => {
  it("should define two organizations", () => {
    expect(ORGS).toHaveLength(2);
  });

  it("should define Acme Corp with 5 teams", () => {
    const org = ORGS[0];
    expect(org.id).toBe("org_acme");
    expect(org.name).toBe("Acme Corp");
    expect(org.plan).toBe("enterprise");
    expect(org.monthly_budget).toBe(50000);
    expect(org.teams).toHaveLength(5);
  });

  it("should have Acme team sizes totaling 50 users", () => {
    const org = ORGS[0];
    const totalSize = org.teams.reduce((sum, t) => sum + t.size, 0);
    expect(totalSize).toBe(50);
  });

  it("should define Globex Corporation with 3 teams", () => {
    const org = ORGS[1];
    expect(org.id).toBe("org_globex");
    expect(org.name).toBe("Globex Corporation");
    expect(org.plan).toBe("business");
    expect(org.monthly_budget).toBe(20000);
    expect(org.teams).toHaveLength(3);
  });

  it("should have Globex team sizes totaling 20 users", () => {
    const org = ORGS[1];
    const totalSize = org.teams.reduce((sum, t) => sum + t.size, 0);
    expect(totalSize).toBe(20);
  });

  it("should have globally unique team IDs across all orgs", () => {
    const allTeamIds = ORGS.flatMap((o) => o.teams.map((t) => t.id));
    expect(new Set(allTeamIds).size).toBe(allTeamIds.length);
  });
});

describe("User generation — Acme", () => {
  const org = ORGS[0];
  const users = generateUsers(org, 42);

  it("should generate 51 users (50 + well-known demo user)", () => {
    expect(users).toHaveLength(51);
  });

  it("should assign all users to org_acme", () => {
    for (const user of users) {
      expect(user.org_id).toBe("org_acme");
    }
  });

  it("should have well-known demo user as admin", () => {
    const demo = users.find((u) => u.user_id === "user");
    expect(demo).toBeDefined();
    expect(demo!.email).toBe("user@acmecorp.com");
    expect(demo!.role).toBe("admin");
  });

  it("should have exactly 1 admin", () => {
    const admins = users.filter((u) => u.role === "admin");
    expect(admins).toHaveLength(1);
  });

  it("should have team_leads for each team", () => {
    const leads = users.filter((u) => u.role === "team_lead");
    expect(leads.length).toBeGreaterThanOrEqual(4);
  });

  it("should distribute users across teams according to team sizes", () => {
    for (const team of org.teams) {
      const teamUsers = users.filter((u) => u.team_id === team.id);
      // team_platform has +1 for the well-known demo user
      const expected = team.id === "team_platform" ? team.size + 1 : team.size;
      expect(teamUsers).toHaveLength(expected);
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

describe("User generation — Globex", () => {
  const org = ORGS[1];
  const users = generateUsers(org, 42);

  it("should generate 21 users (20 + well-known admin)", () => {
    expect(users).toHaveLength(21);
  });

  it("should assign all users to org_globex", () => {
    for (const user of users) {
      expect(user.org_id).toBe("org_globex");
    }
  });

  it("should have well-known admin user", () => {
    const admin = users.find((u) => u.user_id === "user_globex_admin");
    expect(admin).toBeDefined();
    expect(admin!.email).toBe("admin@globexcorporation.com");
    expect(admin!.role).toBe("admin");
  });

  it("should have exactly 1 admin", () => {
    const admins = users.filter((u) => u.role === "admin");
    expect(admins).toHaveLength(1);
  });

  it("should generate unique user IDs", () => {
    const ids = new Set(users.map((u) => u.user_id));
    expect(ids.size).toBe(users.length);
  });

  it("should generate unique emails within the org", () => {
    const emails = new Set(users.map((u) => u.email));
    expect(emails.size).toBe(users.length);
  });

  it("should not overlap with Acme user IDs", () => {
    const acmeUsers = generateUsers(ORGS[0], 42);
    const acmeIds = new Set(acmeUsers.map((u) => u.user_id));
    for (const user of users) {
      expect(acmeIds.has(user.user_id)).toBe(false);
    }
  });
});

describe("Project generation", () => {
  it("should generate 10 projects per org", () => {
    for (const org of ORGS) {
      const projects = generateProjects(org);
      expect(projects).toHaveLength(10);
    }
  });

  it("should assign projects to correct org", () => {
    for (const org of ORGS) {
      const projects = generateProjects(org);
      for (const project of projects) {
        expect(project.org_id).toBe(org.id);
      }
    }
  });

  it("should distribute projects across teams", () => {
    for (const org of ORGS) {
      const projects = generateProjects(org);
      const teamIds = new Set(projects.map((p) => p.team_id));
      expect(teamIds.size).toBe(org.teams.length);
    }
  });

  it("should generate unique project IDs across orgs", () => {
    const allIds = ORGS.flatMap((o) => generateProjects(o).map((p) => p.project_id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("should have repository URLs", () => {
    for (const org of ORGS) {
      for (const project of generateProjects(org)) {
        expect(project.repository_url).toMatch(/^https:\/\/github\.com\//);
      }
    }
  });
});

describe("API key generation", () => {
  it("should generate 2 API keys per org", () => {
    for (const org of ORGS) {
      const keys = generateApiKeys(org);
      expect(keys).toHaveLength(2);
    }
  });

  it("should assign keys to correct org", () => {
    for (const org of ORGS) {
      const keys = generateApiKeys(org);
      for (const key of keys) {
        expect(key.org_id).toBe(org.id);
      }
    }
  });

  it("should have deterministic plain keys with org prefix", () => {
    const acmeKeys = generateApiKeys(ORGS[0]);
    expect(acmeKeys[0].plain_key).toBe("ak_acme_001");
    expect(acmeKeys[1].plain_key).toBe("ak_acme_002");

    const globexKeys = generateApiKeys(ORGS[1]);
    expect(globexKeys[0].plain_key).toBe("ak_globex_001");
    expect(globexKeys[1].plain_key).toBe("ak_globex_002");
  });

  it("should have unique API key IDs across orgs", () => {
    const allIds = ORGS.flatMap((o) => generateApiKeys(o).map((k) => k.api_key_id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("should have bcrypt-hashed keys", () => {
    for (const org of ORGS) {
      const keys = generateApiKeys(org);
      for (const key of keys) {
        expect(key.key_hash).toMatch(/^\$2[aby]\$/);
      }
    }
  });

  it("should mark all keys as active", () => {
    for (const org of ORGS) {
      const keys = generateApiKeys(org);
      for (const key of keys) {
        expect(key.is_active).toBe(true);
      }
    }
  });
});
