/** A static file next to the pages, not part of the API; served with no-cache like them. */
export async function getDeployedBuild(): Promise<string | undefined> {
  const res = await fetch("/version.json", { cache: "no-store" });
  if (!res.ok) return undefined;
  const body: unknown = await res.json();
  return body && typeof body === "object" && "build" in body && typeof body.build === "string" ? body.build : undefined;
}
