import type { Container, MeResponse } from "@dash/core";
import * as containersApi from "../api/containers.api";
import { queryClient as qc } from "./client";
import { keys } from "./keys";
import { run } from "./run";

const setContainers = (fn: (containers: Container[]) => Container[]) =>
  qc.setQueryData<MeResponse>(keys.me, (old) => old && { ...old, containers: fn(old.containers) });

export function addContainer(container: Container) {
  return run({
    scope: { id: `container:${container.id}` },
    onMutate: () => setContainers((all) => [...all, container]),
    mutationFn: () => containersApi.postContainer(container),
    onError: () => setContainers((all) => all.filter((c) => c.id !== container.id)),
  });
}

export function updateContainer(container: Container) {
  const before = qc.getQueryData<MeResponse>(keys.me)?.containers.find((c) => c.id === container.id);
  return run({
    scope: { id: `container:${container.id}` },
    onMutate: () => setContainers((all) => all.map((c) => (c.id === container.id ? container : c))),
    mutationFn: () => containersApi.putContainer(container),
    onError: () => before && setContainers((all) => all.map((c) => (c.id === container.id ? before : c))),
  });
}

export function removeContainer(container: Container) {
  return run({
    scope: { id: `container:${container.id}` },
    onMutate: () => setContainers((all) => all.filter((c) => c.id !== container.id)),
    mutationFn: () => containersApi.deleteContainer(container.id),
    onError: () => setContainers((all) => [...all, container]),
  });
}
