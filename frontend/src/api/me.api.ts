import type { MeResponse, PlanHistory, Profile, SaveAreaVersionsRequest, SavePlanRequest, UpdateProfileRequest } from "@dash/core";
import { api } from "./client";

export const getMe = () => api.get<MeResponse>("/me");
export const putProfile = (body: UpdateProfileRequest) => api.put<Profile>("/profile", body);
export const postPlan = (body: SavePlanRequest) => api.post<PlanHistory>("/plan", body);
export const putPlanVersions = (body: SaveAreaVersionsRequest) => api.put<PlanHistory>("/plan/versions", body);
export const postRecapSeen = (day: string) => api.post<{ recapSeenOn: string }>("/recap/seen", { day });
export const deleteRecapSeen = () => api.delete("/recap/seen");
export const postSetupOffered = () => api.post<void>("/setup/offered");
