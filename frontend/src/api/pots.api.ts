import type { Pot } from "@dash/core";
import { api } from "./client";

export const postPot = (pot: Pot) => api.post<Pot>("/pots", pot);
export const deletePot = (id: string) => api.delete(`/pots/${id}`);
