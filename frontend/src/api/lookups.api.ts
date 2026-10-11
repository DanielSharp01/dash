import type { BarcodeResult, IconEntry, ProductResult } from "@dash/core";
import { api } from "./client";

export const getBarcode = (code: string) => api.get<BarcodeResult>(`/barcodes/${encodeURIComponent(code)}`);
export const getProduct = (code: string) => api.get<ProductResult>(`/barcodes/${encodeURIComponent(code)}/product`);
export const getIcons = () => api.get<{ icons: IconEntry[] }>("/icons");
