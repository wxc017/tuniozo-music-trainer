// Coarse muscle groups people actually think in — shared by the volume readout
// and by custom-exercise tagging. Kept dependency-free so both workoutTypes.ts
// (data model) and muscleVolume.ts (aggregation) can import it without a cycle.

export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps"
  | "forearms" | "core" | "legs";

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: "Chest", back: "Back", shoulders: "Shoulders", biceps: "Biceps",
  triceps: "Triceps", forearms: "Forearms", core: "Core", legs: "Legs",
};

export const GROUP_ORDER: MuscleGroup[] = ["chest", "back", "shoulders", "biceps", "triceps", "core", "forearms", "legs"];
