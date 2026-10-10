import type { WeighIn } from "@dash/core";
import { api } from "./client";

export const getWeighIns = () => api.get<{ weighIns: WeighIn[] }>("/weigh-ins");
export const postWeighIn = (w: WeighIn) => api.post<WeighIn>("/weigh-ins", w);
export const deleteWeighIn = (id: string) => api.delete(`/weigh-ins/${id}`);
