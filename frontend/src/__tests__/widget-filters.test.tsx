import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WidgetModal } from "@/components/widgets/WidgetModal";

// Mock useOrg to return teams/projects with distinct IDs vs display values.
// The key invariant: team_id !== slug, project_id !== name.
// Before the fix, the <option> value used slug/name instead of team_id/project_id,
// causing ClickHouse queries to return zero rows.
const MOCK_TEAMS = [
  { team_id: "team_platform", name: "Platform", slug: "platform" },
  { team_id: "team_ml", name: "ML Team", slug: "ml-team" },
];

const MOCK_PROJECTS = [
  { project_id: "proj_org_acme_00", name: "api-gateway", repository_url: null, team_id: "team_platform" },
  { project_id: "proj_org_acme_01", name: "ml-pipeline", repository_url: null, team_id: "team_ml" },
];

vi.mock("@/api/hooks", () => ({
  useOrg: () => ({
    data: {
      org_id: "org_test",
      name: "Test Org",
      plan: "enterprise",
      monthly_budget: 10000,
      licensed_users: 50,
      teams: MOCK_TEAMS,
      projects: MOCK_PROJECTS,
    },
    isLoading: false,
    error: null,
  }),
}));

function renderModal(onAdd = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onAdd,
    ...render(
      <QueryClientProvider client={queryClient}>
        <WidgetModal open={true} onClose={vi.fn()} onAdd={onAdd} />
      </QueryClientProvider>,
    ),
  };
}

describe("WidgetModal filter option values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("team filter options use team_id as value, not slug", () => {
    renderModal();

    fireEvent.click(screen.getByText("+ Add Filters"));

    const teamSelect = screen.getByLabelText("Team");
    const options = within(teamSelect).getAllByRole("option");

    expect(options).toHaveLength(2);
    expect((options[0] as HTMLOptionElement).value).toBe("team_platform");
    expect((options[1] as HTMLOptionElement).value).toBe("team_ml");
  });

  it("project filter options use project_id as value, not name", () => {
    renderModal();

    fireEvent.click(screen.getByText("+ Add Filters"));

    const projectSelect = screen.getByLabelText("Project");
    const options = within(projectSelect).getAllByRole("option");

    expect(options).toHaveLength(2);
    expect((options[0] as HTMLOptionElement).value).toBe("proj_org_acme_00");
    expect((options[1] as HTMLOptionElement).value).toBe("proj_org_acme_01");
  });

  it("submitted config.filters.teams contains team_id values", () => {
    const onAdd = vi.fn();
    renderModal(onAdd);

    // Expand filters and select a team
    fireEvent.click(screen.getByText("+ Add Filters"));
    const teamSelect = screen.getByLabelText("Team") as HTMLSelectElement;
    const option = within(teamSelect).getByText("Platform") as HTMLOptionElement;
    option.selected = true;
    fireEvent.change(teamSelect);

    // Submit via the button (not the heading)
    fireEvent.click(screen.getByRole("button", { name: "Add Widget" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const config = onAdd.mock.calls[0][0];
    expect(config.filters.teams).toEqual(["team_platform"]);
  });

  it("submitted config.filters.projects contains project_id values", () => {
    const onAdd = vi.fn();
    renderModal(onAdd);

    // Expand filters and select a project
    fireEvent.click(screen.getByText("+ Add Filters"));
    const projectSelect = screen.getByLabelText("Project") as HTMLSelectElement;
    const option = within(projectSelect).getByText("api-gateway") as HTMLOptionElement;
    option.selected = true;
    fireEvent.change(projectSelect);

    // Submit via the button
    fireEvent.click(screen.getByRole("button", { name: "Add Widget" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const config = onAdd.mock.calls[0][0];
    expect(config.filters.projects).toEqual(["proj_org_acme_00"]);
  });
});
