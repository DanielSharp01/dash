import { queryOptions, useQuery } from "@tanstack/react-query";
import { getDeployedBuild } from "../api/version.api";
import { keys } from "./keys";

/**
 * Checked whenever the app comes back to the foreground, which is when a phone tab is most
 * likely to be stale, and every few minutes while it stays open.
 */
export const deployedBuildQuery = queryOptions({
  queryKey: keys.deployedBuild,
  queryFn: getDeployedBuild,
  staleTime: 0,
  refetchOnWindowFocus: "always",
  refetchInterval: 5 * 60_000,
  retry: false,
});

export function useUpdateAvailable() {
  const deployed = useQuery(deployedBuildQuery).data;
  return deployed !== undefined && deployed !== __BUILD_ID__;
}
