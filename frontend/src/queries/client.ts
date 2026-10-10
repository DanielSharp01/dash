import { MutationCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";

declare module "@tanstack/react-query" {
  interface Register {
    /** quiet: the caller shows its own message, e.g. undo's "edited since". */
    mutationMeta: { quiet?: boolean };
  }
}

type ErrorHandler = (error: unknown, retry: () => void) => void;

let onMutationError: ErrorHandler = () => {};

/** The app decides how a failed save is shown; queries/ knows nothing about screens. */
export const setMutationErrorHandler = (handler: ErrorHandler) => {
  onMutationError = handler;
};

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, variables, _result, mutation) => {
      if (mutation.meta?.quiet) return;
      onMutationError(error, () => void mutation.execute(variables).catch(() => {}));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 4xx won't change by asking again.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      networkMode: "always",
    },
    // Online only: a save without a connection fails at once and offers a retry, instead of waiting.
    mutations: { networkMode: "always", retry: false },
  },
});
