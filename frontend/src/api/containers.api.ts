import type { Container } from "@dash/core";
import { api } from "./client";

export const postContainer = (container: Container) => api.post<Container>("/containers", container);
export const putContainer = (container: Container) => api.put<Container>(`/containers/${container.id}`, container);
export const deleteContainer = (id: string) => api.delete(`/containers/${id}`);
