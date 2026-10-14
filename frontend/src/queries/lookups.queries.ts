import * as lookupsApi from "../api/lookups.api";
import { putFoods } from "./cache";
import { queryClient as qc } from "./client";
import { keys } from "./keys";

/** The person's matching items first, then public ones; Open Food Facts only when none match. */
export const lookupBarcode = (code: string) =>
  qc
    .fetchQuery({ queryKey: keys.barcode(code), queryFn: () => lookupsApi.getBarcode(code), staleTime: 5 * 60_000 })
    .then((result) => (putFoods(qc, result.foods), result));

/** Open Food Facts' answer for the code, even when one of the person's items already has it. */
export const productForBarcode = (code: string) =>
  qc.fetchQuery({ queryKey: keys.product(code), queryFn: () => lookupsApi.getProduct(code), staleTime: 5 * 60_000 });
