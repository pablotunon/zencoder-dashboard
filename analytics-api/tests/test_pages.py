"""Tests for Pages API — CRUD, slug generation, seeding, templates, reorder."""
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_org_context
from app.main import app
from app.models.auth import OrgContext

MOCK_CTX = OrgContext(
    org_id="org_acme", user_id="user_test", role="admin", team_id="team_platform"
)

MOCK_CTX_OTHER = OrgContext(
    org_id="org_globex", user_id="user_other", role="viewer", team_id="team_eng"
)


@pytest.fixture
def client():
    app.dependency_overrides[get_org_context] = lambda: MOCK_CTX
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def other_client():
    app.dependency_overrides[get_org_context] = lambda: MOCK_CTX_OTHER
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def unauth_client():
    """Client without auth override — tests 401 handling."""
    app.dependency_overrides.clear()
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


# --- Helpers ---

def _make_page(
    name="Test Page",
    slug="test-page",
    icon="chart-bar",
    sort_order=0,
    layout=None,
    page_id=None,
):
    return {
        "page_id": page_id or str(uuid.uuid4()),
        "name": name,
        "slug": slug,
        "icon": icon,
        "sort_order": sort_order,
        "layout": layout or [],
    }


# --- List pages ---

class TestListPages:
    def test_list_pages_returns_summaries(self, client):
        pages = [
            _make_page("Overview", "overview", "chart-bar", 0),
            _make_page("Cost", "cost", "currency-dollar", 1),
        ]
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.get_user_pages = AsyncMock(return_value=pages)
            resp = client.get("/api/pages")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["name"] == "Overview"
        assert data[0]["slug"] == "overview"
        assert data[1]["sort_order"] == 1
        mock_svc.get_user_pages.assert_called_once_with("user_test")

    def test_list_pages_empty(self, client):
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.get_user_pages = AsyncMock(return_value=[])
            resp = client.get("/api/pages")

        assert resp.status_code == 200
        assert resp.json() == []


# --- Get page by slug ---

class TestGetPage:
    def test_get_page_returns_detail(self, client):
        page = _make_page(layout=[{"id": "row-1", "columns": 2, "widgets": []}])
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.get_page_by_slug = AsyncMock(return_value=page)
            resp = client.get("/api/pages/test-page")

        assert resp.status_code == 200
        data = resp.json()
        assert data["slug"] == "test-page"
        assert len(data["layout"]) == 1
        mock_svc.get_page_by_slug.assert_called_once_with("user_test", "test-page")

    def test_get_page_not_found(self, client):
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.get_page_by_slug = AsyncMock(return_value=None)
            resp = client.get("/api/pages/nonexistent")

        assert resp.status_code == 404


# --- Create page ---

class TestCreatePage:
    def test_create_blank_page(self, client):
        created = _make_page("My Dashboard", "my-dashboard", "star", 3)
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.create_page = AsyncMock(return_value=created)
            resp = client.post("/api/pages", json={
                "name": "My Dashboard",
                "icon": "star",
            })

        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "My Dashboard"
        assert data["slug"] == "my-dashboard"
        mock_svc.create_page.assert_called_once_with(
            user_id="user_test",
            org_id="org_acme",
            name="My Dashboard",
            icon="star",
            layout=[],
        )

    def test_create_page_from_template(self, client):
        created = _make_page("Cost View", "cost-view", "currency-dollar", 4,
                             layout=[{"id": "r1", "columns": 1, "widgets": []}])
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.create_page = AsyncMock(return_value=created)
            resp = client.post("/api/pages", json={
                "name": "Cost View",
                "icon": "currency-dollar",
                "template": "cost-efficiency",
            })

        assert resp.status_code == 201
        # Template layout should have been passed (non-empty)
        call_kwargs = mock_svc.create_page.call_args
        assert len(call_kwargs.kwargs.get("layout", call_kwargs[1].get("layout", []))) > 0

    def test_create_page_validation_empty_name(self, client):
        resp = client.post("/api/pages", json={"name": "", "icon": "star"})
        assert resp.status_code == 422

    def test_create_page_validation_name_too_long(self, client):
        resp = client.post("/api/pages", json={"name": "x" * 101, "icon": "star"})
        assert resp.status_code == 422


# --- Update page ---

class TestUpdatePage:
    def test_update_page_name(self, client):
        updated = _make_page("New Name", "new-name", "chart-bar", 0)
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.update_page = AsyncMock(return_value=updated)
            resp = client.put("/api/pages/old-slug", json={"name": "New Name"})

        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"
        assert resp.json()["slug"] == "new-name"
        mock_svc.update_page.assert_called_once_with(
            user_id="user_test",
            slug="old-slug",
            name="New Name",
            icon=None,
            layout=None,
        )

    def test_update_page_layout(self, client):
        layout = [{"id": "r1", "columns": 2, "widgets": []}]
        updated = _make_page(layout=layout)
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.update_page = AsyncMock(return_value=updated)
            resp = client.put("/api/pages/test-page", json={"layout": layout})

        assert resp.status_code == 200
        assert resp.json()["layout"] == layout

    def test_update_page_not_found(self, client):
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.update_page = AsyncMock(return_value=None)
            resp = client.put("/api/pages/nonexistent", json={"name": "X"})

        assert resp.status_code == 404


# --- Delete page ---

class TestDeletePage:
    def test_delete_page_success(self, client):
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.delete_page = AsyncMock(return_value=True)
            resp = client.delete("/api/pages/test-page")

        assert resp.status_code == 204
        mock_svc.delete_page.assert_called_once_with("user_test", "test-page")

    def test_delete_page_not_found(self, client):
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.delete_page = AsyncMock(return_value=False)
            resp = client.delete("/api/pages/nonexistent")

        assert resp.status_code == 404


# --- Reorder pages ---

class TestReorderPages:
    def test_reorder_pages(self, client):
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.reorder_pages = AsyncMock()
            resp = client.patch("/api/pages/reorder", json={
                "page_ids": ["id-3", "id-1", "id-2"],
            })

        assert resp.status_code == 204
        mock_svc.reorder_pages.assert_called_once_with("user_test", ["id-3", "id-1", "id-2"])


# --- Templates ---

class TestTemplates:
    def test_list_templates(self, client):
        resp = client.get("/api/pages/templates")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 4
        names = {t["name"] for t in data}
        assert "Overview" in names
        assert "Cost & Efficiency" in names
        for t in data:
            assert t["id"]
            assert t["icon"]
            assert t["description"]


# --- Auth requirement ---

class TestAuthRequired:
    def test_list_pages_requires_auth(self, unauth_client):
        resp = unauth_client.get("/api/pages")
        assert resp.status_code == 401

    def test_create_page_requires_auth(self, unauth_client):
        resp = unauth_client.post("/api/pages", json={"name": "X"})
        assert resp.status_code == 401

    def test_get_page_requires_auth(self, unauth_client):
        resp = unauth_client.get("/api/pages/test")
        assert resp.status_code == 401

    def test_delete_page_requires_auth(self, unauth_client):
        resp = unauth_client.delete("/api/pages/test")
        assert resp.status_code == 401


# --- Slug generation (unit) ---

class TestSlugGeneration:
    def test_basic_slug(self):
        from app.services.page_service import _generate_slug
        assert _generate_slug("Overview") == "overview"

    def test_slug_with_special_chars(self):
        from app.services.page_service import _generate_slug
        assert _generate_slug("Cost & Efficiency") == "cost-efficiency"

    def test_slug_with_multiple_spaces(self):
        from app.services.page_service import _generate_slug
        assert _generate_slug("My  Cool   Page") == "my-cool-page"

    def test_slug_all_special_chars(self):
        from app.services.page_service import _generate_slug
        assert _generate_slug("@#$%") == "page"

    def test_slug_with_numbers(self):
        from app.services.page_service import _generate_slug
        assert _generate_slug("Dashboard 2") == "dashboard-2"


# --- Page seeding on login ---

class TestLoginSeeding:
    def test_login_seeds_pages(self, client):
        mock_user = {
            "user_id": "user_test",
            "org_id": "org_acme",
            "team_id": "team_platform",
            "name": "Test User",
            "email": "test@acme.com",
            "avatar_url": None,
            "role": "admin",
            "is_active": True,
            "password_hash": "$2b$12$validhash",
            "org_name": "Acme Corp",
            "org_plan": "enterprise",
        }
        with patch("app.routers.auth.pg_service") as mock_pg, \
             patch("app.routers.auth.redis_cache") as mock_redis, \
             patch("app.routers.auth.verify_password", return_value=True), \
             patch("app.routers.auth.create_access_token", return_value="mock-token"), \
             patch("app.routers.auth.create_refresh_token", return_value="mock-refresh"), \
             patch("app.routers.auth.page_service") as mock_page_svc:
            mock_pg.get_user_by_email = AsyncMock(return_value=mock_user)
            mock_redis.get_client.return_value = MagicMock()
            mock_page_svc.seed_default_pages = AsyncMock(return_value=[])

            resp = client.post("/api/auth/login", json={
                "email": "test@acme.com",
                "password": "pass123",
            })

        assert resp.status_code == 200
        mock_page_svc.seed_default_pages.assert_called_once_with("user_test", "org_acme")

    def test_login_succeeds_even_if_seeding_fails(self, client):
        mock_user = {
            "user_id": "user_test",
            "org_id": "org_acme",
            "team_id": "team_platform",
            "name": "Test User",
            "email": "test@acme.com",
            "avatar_url": None,
            "role": "admin",
            "is_active": True,
            "password_hash": "$2b$12$validhash",
            "org_name": "Acme Corp",
            "org_plan": "enterprise",
        }
        with patch("app.routers.auth.pg_service") as mock_pg, \
             patch("app.routers.auth.redis_cache") as mock_redis, \
             patch("app.routers.auth.verify_password", return_value=True), \
             patch("app.routers.auth.create_access_token", return_value="mock-token"), \
             patch("app.routers.auth.create_refresh_token", return_value="mock-refresh"), \
             patch("app.routers.auth.page_service") as mock_page_svc:
            mock_pg.get_user_by_email = AsyncMock(return_value=mock_user)
            mock_redis.get_client.return_value = MagicMock()
            mock_page_svc.seed_default_pages = AsyncMock(side_effect=Exception("DB down"))

            resp = client.post("/api/auth/login", json={
                "email": "test@acme.com",
                "password": "pass123",
            })

        # Login should still succeed even if seeding fails
        assert resp.status_code == 200


# --- Cross-user isolation ---

class TestCrossUserIsolation:
    def test_list_pages_scoped_to_user(self, client):
        """User's pages endpoint is called with their user_id."""
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.get_user_pages = AsyncMock(return_value=[])
            client.get("/api/pages")
            mock_svc.get_user_pages.assert_called_with("user_test")

    def test_list_pages_scoped_to_other_user(self, other_client):
        """Different user context passes different user_id."""
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.get_user_pages = AsyncMock(return_value=[])
            other_client.get("/api/pages")
            mock_svc.get_user_pages.assert_called_with("user_other")

    def test_get_page_scoped_to_user(self, client):
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.get_page_by_slug = AsyncMock(return_value=None)
            client.get("/api/pages/some-slug")
            mock_svc.get_page_by_slug.assert_called_once_with("user_test", "some-slug")

    def test_delete_page_scoped_to_user(self, client):
        with patch("app.routers.pages.page_service") as mock_svc:
            mock_svc.delete_page = AsyncMock(return_value=False)
            client.delete("/api/pages/some-slug")
            mock_svc.delete_page.assert_called_once_with("user_test", "some-slug")
