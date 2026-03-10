-- AgentHub Analytics — PostgreSQL Schema (Phase A)

CREATE TABLE organizations (
    org_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(32) NOT NULL DEFAULT 'enterprise',
    monthly_budget DECIMAL(10, 2),
    logo_url VARCHAR(512),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE teams (
    team_id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) REFERENCES organizations(org_id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (org_id, slug)
);

CREATE TABLE users (
    user_id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) REFERENCES organizations(org_id),
    team_id VARCHAR(64) REFERENCES teams(team_id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(512),
    role VARCHAR(32) NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT TRUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (email)
);

CREATE TABLE projects (
    project_id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) REFERENCES organizations(org_id),
    team_id VARCHAR(64) REFERENCES teams(team_id),
    name VARCHAR(255) NOT NULL,
    repository_url VARCHAR(512),
    created_at TIMESTAMP DEFAULT NOW()
);
