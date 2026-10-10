import type { BarcodeResult, IconEntry } from "@dash/core";
import { api } from "./client";

export const getBarcode = (code: string) => api.get<BarcodeResult>(`/barcodes/${encodeURIComponent(code)}`);
export const getIcons = () => api.get<{ icons: IconEntry[] }>("/icons");
