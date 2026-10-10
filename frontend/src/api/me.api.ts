import type { MeResponse, PlanHistory, Profile, SavePlanRequest, UpdateProfileRequest } from "@dash/core";
import { api } from "./client";

export const getMe = () => api.get<MeResponse>("/me");
export const putProfile = (body: UpdateProfileRequest) => api.put<Profile>("/profile", body);
export const postPlan = (body: SavePlanRequest) => api.post<PlanHistory>("/plan", body);
