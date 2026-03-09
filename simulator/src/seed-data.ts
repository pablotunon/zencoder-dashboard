import pg from "pg";
import type { Config } from "./config.js";
import {
  ORGS,
  generateUsers,
  generateProjects,
  type OrgDefinition,
  type UserRecord,
  type ProjectRecord,
} from "./generators/org.js";

/**
 * Seed PostgreSQL with organization structure.
 * Idempotent: uses INSERT ... ON CONFLICT DO NOTHING.
 */
export async function seedDatabase(
  config: Config,
): Promise<{
  orgs: OrgDefinition[];
  users: UserRecord[];
  projects: ProjectRecord[];
}> {
  const client = new pg.Client({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
  });

  await client.connect();
  console.log("[seed] Connected to PostgreSQL");

  try {
    const allUsers: UserRecord[] = [];
    const allProjects: ProjectRecord[] = [];

    for (const org of ORGS) {
      // Insert organization
      await client.query(
        `INSERT INTO organizations (org_id, name, plan, monthly_budget)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (org_id) DO NOTHING`,
        [org.id, org.name, org.plan, org.monthly_budget],
      );
      console.log(`[seed] Org: ${org.name}`);

      // Insert teams
      for (const team of org.teams) {
        await client.query(
          `INSERT INTO teams (team_id, org_id, name, slug)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (team_id) DO NOTHING`,
          [team.id, org.id, team.name, team.slug],
        );
      }
      console.log(`[seed] Teams: ${org.teams.length}`);

      // Generate and insert users
      const users = generateUsers(org, 42);
      for (const user of users) {
        await client.query(
          `INSERT INTO users (user_id, org_id, team_id, name, email, avatar_url, role, is_active, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (user_id) DO NOTHING`,
          [
            user.user_id,
            user.org_id,
            user.team_id,
            user.name,
            user.email,
            user.avatar_url,
            user.role,
            user.is_active,
            user.password_hash,
          ],
        );
      }
      console.log(`[seed] Users: ${users.length}`);
      allUsers.push(...users);

      // Generate and insert projects
      const projects = generateProjects(org);
      for (const project of projects) {
        await client.query(
          `INSERT INTO projects (project_id, org_id, team_id, name, repository_url)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (project_id) DO NOTHING`,
          [
            project.project_id,
            project.org_id,
            project.team_id,
            project.name,
            project.repository_url,
          ],
        );
      }
      console.log(`[seed] Projects: ${projects.length}`);
      allProjects.push(...projects);
    }

    console.log("[seed] Database seeding complete");
    return { orgs: ORGS, users: allUsers, projects: allProjects };
  } finally {
    await client.end();
  }
}
