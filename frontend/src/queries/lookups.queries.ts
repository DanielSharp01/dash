import * as lookupsApi from "../api/lookups.api";
import { queryClient as qc } from "./client";
import { keys } from "./keys";

/** The person's matching items first, then public ones; Open Food Facts only when none match. */
export const lookupBarcode = (code: string) =>
  qc.fetchQuery({ queryKey: keys.barcode(code), queryFn: () => lookupsApi.getBarcode(code), staleTime: 5 * 60_000 });
