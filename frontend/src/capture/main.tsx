import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { activitiesQuery, activityUsageQuery } from "../queries/activities.queries";
import { queryClient, setMutationErrorHandler } from "../queries/client";
import { followUpQuery } from "../queries/entries.queries";
import { foodsQuery, foodUsageQuery } from "../queries/foods.queries";
import { meQuery } from "../queries/me.queries";
import { weighInsQuery } from "../queries/weighIns.queries";
import { App } from "./App";
import { showSaveError } from "./errors";
import { LoadError } from "./ui/LoadError";
import "./styles.css";

setMutationErrorHandler(showSaveError);

// Started together, so the screens' suspense doesn't wait for them one after another.
void queryClient.prefetchQuery(meQuery);
void queryClient.prefetchQuery(foodsQuery);
void queryClient.prefetchQuery(foodUsageQuery);
void queryClient.prefetchQuery(activitiesQuery);
void queryClient.prefetchQuery(activityUsageQuery);
void queryClient.prefetchQuery(followUpQuery);
void queryClient.prefetchQuery(weighInsQuery);

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter basename="/capture">
      <LoadError>
        <Suspense fallback={<div className="loading" aria-busy />}>
          <App />
        </Suspense>
      </LoadError>
    </BrowserRouter>
  </QueryClientProvider>,
);

if (import.meta.env.DEV) {
  import("./DevTools").then(({ mountDevTools }) => mountDevTools());
}
