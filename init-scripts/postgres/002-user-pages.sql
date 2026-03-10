-- User custom dashboard pages

CREATE TABLE user_pages (
    page_id     VARCHAR(64) PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL REFERENCES users(user_id),
    org_id      VARCHAR(64) NOT NULL REFERENCES organizations(org_id),
    name        VARCHAR(255) NOT NULL,
    icon        VARCHAR(64) NOT NULL DEFAULT 'squares-2x2',
    layout      JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_pages_user ON user_pages(user_id, sort_order);
CREATE INDEX idx_user_pages_org  ON user_pages(org_id, user_id);
