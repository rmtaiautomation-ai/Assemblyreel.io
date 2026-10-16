import "server-only";
import { workspaceDashboardReady } from "@/server/auth/policy";
import { AccessError } from "./requests";
import { listOwnedWorkspaces } from "./workspaces";

export function requireWorkspaceDashboard() {
  if (!workspaceDashboardReady()) throw new AccessError(503, "FEATURE_UNAVAILABLE", "Workspace dashboard is awaiting configuration.");
}

export async function dashboardDestination() {
  requireWorkspaceDashboard();
  const workspaces = await listOwnedWorkspaces();
  return { workspaces, needsSetup: workspaces.length === 0 };
}
