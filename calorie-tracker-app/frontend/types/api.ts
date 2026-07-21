/**
 * Shared shapes for the /api/v1/log-meal and /api/v1/meals endpoints.
 * Mirrors the Pydantic schemas in backend/main.py.
 */

export type NutritionSource = "icmr_nin" | "estimated";
export type MealType = "Breakfast" | "Lunch" | "Snacks" | "Dinner";

export interface LoggedFoodItem {
  item_name: string;
  estimated_grams: number;
  logged_grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  nutrition_source: NutritionSource;
}

export interface LogMealRequest {
  meal_type: MealType;
  food_items: LoggedFoodItem[];
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
}

export interface LoggedMeal {
  id: number;
  logged_at: string; // ISO timestamp
  meal_type: MealType;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  food_items: LoggedFoodItem[];
}

export interface MealsListResponse {
  meals: LoggedMeal[];
}

/** Infers a diary meal-type bucket from the time of day (matches MEAL_SECTIONS in diary.tsx). */
export function inferMealType(d: Date = new Date()): MealType {
  const h = d.getHours();
  if (h < 11) return "Breakfast";
  if (h < 16) return "Lunch";
  if (h < 19) return "Snacks";
  return "Dinner";
}

/** Formats a Date as the YYYY-MM-DD the backend's `date` query param expects. */
export function toDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface TodaySummary {
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  meals: LoggedMeal[];
}

export interface UserProfile {
  id: number;
  updated_at: string;
  name: string;
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
}

export type UserProfileUpdate = Omit<UserProfile, "id" | "updated_at">;

// ─── Meal planning (Phase A) ──────────────────────────────────────────────────
// Mirrors the planned-meals schemas in backend/main.py.

export type PlannedStatus = "planned" | "logged" | "skipped";

export interface PlannedItemInput {
  item_name: string;
  grams: number;
}

export interface PlannedFoodItem {
  item_name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  nutrition_source: NutritionSource;
}

export interface PlannedMeal {
  id: number;
  scheduled_for: string; // ISO timestamp
  meal_type: MealType;
  items: PlannedFoodItem[];
  reminder_at: string | null;
  status: PlannedStatus;
  logged_meal_id: number | null;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
}

export interface PlannedMealsListResponse {
  planned_meals: PlannedMeal[];
}

export interface CreatePlannedMealRequest {
  meal_type: MealType;
  scheduled_for: string; // ISO timestamp
  items: PlannedItemInput[];
  reminder_at?: string | null;
}

/** Default clock time (local) each meal slot is planned for. */
export const SLOT_DEFAULT_HOUR: Record<MealType, number> = {
  Breakfast: 8,
  Lunch: 13,
  Snacks: 17,
  Dinner: 20,
};

/** Builds an ISO timestamp for a planned meal: the given day at the slot's default hour, local time. */
export function slotDateTimeISO(day: Date, slot: MealType): string {
  const d = new Date(day);
  d.setHours(SLOT_DEFAULT_HOUR[slot], 0, 0, 0);
  return d.toISOString();
}
