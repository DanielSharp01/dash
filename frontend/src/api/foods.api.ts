import type { Batch, CreateFoodResponse, Food, FoodInput, FoodUsage, SaveBatchResponse, StoredBatch, UpdateFoodResponse } from "@dash/core";
import { api } from "./client";

type WithNewFoods = { newFoods?: FoodInput[] };

export const getFoods = () => api.get<{ foods: Food[] }>("/foods");
export const getFoodUsage = () => api.get<{ usage: FoodUsage[] }>("/foods/usage");
export const postFood = (food: FoodInput & WithNewFoods) => api.post<CreateFoodResponse>("/foods", food);
export const putFood = (food: FoodInput & WithNewFoods & { revision: number }) => api.put<UpdateFoodResponse>(`/foods/${food.id}`, food);
export const deleteFood = (id: string) => api.delete(`/foods/${id}`);
/** A recipe takes the batch everyone starts from; the latest finished one otherwise. */
export const publishFood = (id: string, batch?: string) => api.post<{ food: Food }>(`/foods/${id}/publish${batch ? `?batch=${batch}` : ""}`);
export const copyFood = (id: string) => api.post<{ food: Food }>(`/foods/${id}/copy`);
export const restoreFood = (id: string) => api.post<Food>(`/foods/${id}/restore`);

/** Revision 0 creates the batch. */
export const putBatch = (recipeId: string, batch: Batch & WithNewFoods & { revision: number }) =>
  api.put<SaveBatchResponse>(`/foods/${recipeId}/batches/${batch.id}`, batch);
export const deleteBatch = (recipeId: string, batchId: string) => api.delete(`/foods/${recipeId}/batches/${batchId}`);
export const restoreBatch = (recipeId: string, batchId: string) => api.post<StoredBatch>(`/foods/${recipeId}/batches/${batchId}/restore`);
