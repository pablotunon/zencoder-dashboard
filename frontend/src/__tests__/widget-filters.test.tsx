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

/**
 * Open the filter section and open a specific filter dropdown by label.
 * Returns the dropdown listbox element for scoped queries.
 */
function openFilterDropdown(label: string): HTMLElement {
  // Expand the filters section (only clicks if not already expanded)
  const toggle = screen.queryByText("+ Add Filters");
  if (toggle) fireEvent.click(toggle);

  // Find the MultiSelect container by its label
  const labelEl = screen.getByText(label, { selector: "label" });
  const container = labelEl.closest(".relative") as HTMLElement;
  const trigger = container.querySelector("button")!;
  fireEvent.click(trigger);

  // Return the listbox within this container
  return within(container).getByRole("listbox");
}

describe("WidgetModal filter option values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("team filter dropdown shows all teams with correct labels", () => {
    renderModal();
    const listbox = openFilterDropdown("Team");

    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Platform");
    expect(options[1]).toHaveTextContent("ML Team");
  });

  it("project filter dropdown shows all projects with correct labels", () => {
    renderModal();
    const listbox = openFilterDropdown("Project");

    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("api-gateway");
    expect(options[1]).toHaveTextContent("ml-pipeline");
  });

  it("submitted config.filters.teams contains team_id values", () => {
    const onAdd = vi.fn();
    renderModal(onAdd);

    const listbox = openFilterDropdown("Team");
    const options = within(listbox).getAllByRole("option");

    // Click "Platform" option to select it
    fireEvent.click(options[0]!);

    // Submit via the button (not the heading)
    fireEvent.click(screen.getByRole("button", { name: "Add Widget" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const config = onAdd.mock.calls[0][0];
    expect(config.filters.teams).toEqual(["team_platform"]);
  });

  it("submitted config.filters.projects contains project_id values", () => {
    const onAdd = vi.fn();
    renderModal(onAdd);

    const listbox = openFilterDropdown("Project");
    const options = within(listbox).getAllByRole("option");

    // Click "api-gateway" option to select it
    fireEvent.click(options[0]!);

    // Submit via the button
    fireEvent.click(screen.getByRole("button", { name: "Add Widget" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const config = onAdd.mock.calls[0][0];
    expect(config.filters.projects).toEqual(["proj_org_acme_00"]);
  });

  it("can select multiple values in a single filter", () => {
    const onAdd = vi.fn();
    renderModal(onAdd);

    const listbox = openFilterDropdown("Team");
    const options = within(listbox).getAllByRole("option");

    // Click both teams
    fireEvent.click(options[0]!);
    fireEvent.click(options[1]!);

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Add Widget" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const config = onAdd.mock.calls[0][0];
    expect(config.filters.teams).toEqual(["team_platform", "team_ml"]);
  });

  it("can deselect a value by clicking it again", () => {
    const onAdd = vi.fn();
    renderModal(onAdd);

    const listbox = openFilterDropdown("Team");
    const options = within(listbox).getAllByRole("option");

    // Select both teams, then deselect the first
    fireEvent.click(options[0]!); // select Platform
    fireEvent.click(options[1]!); // select ML Team
    fireEvent.click(options[0]!); // deselect Platform

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Add Widget" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const config = onAdd.mock.calls[0][0];
    expect(config.filters.teams).toEqual(["team_ml"]);
  });
});
