import type { CSSProperties } from "react";
import { PracticeLogEntry } from "@/lib/practiceLog";

interface SnapshotResult { preview: string; snapshot: Record<string, unknown>; canRestore: boolean }

interface SaveBarProps {
  mode: string;
  label: string;
  getSnapshot: () => SnapshotResult;
  /** If provided, each item becomes a separate practice log entry (overrides getSnapshot) */
  getMultiSnapshots?: () => SnapshotResult[] | null;
  /** Optional async function to capture a preview image. Returns a data URL or undefined. */
  getCapture?: () => Promise<string | undefined>;
  /** If provided, shows a dropdown to pick which pattern to log */
  sourceOptions?: { value: string; label: string }[];
  onSourceChange?: (value: string) => void;
  /** If provided, shows a tag dropdown next to LOG (e.g. Isolation / Context) */
  tagOptions?: { value: string; label: string; color: string }[];
  defaultTag?: string;
  onTagChange?: (value: string) => void;
  onSaved?: (entry: PracticeLogEntry) => void;
  style?: CSSProperties;
  hideRatingAndLog?: boolean;
}

// Inline practice-log save bar retired per direct user direction — it rendered
// the "Working On / ★ / + LOG" strip in 8 views; it now renders nothing.  Kept
// as a no-op component so every call site and the practiceLog API stay intact
// (the Practice Log itself still works via the top-bar Practice Log button).
export default function PracticeLogSaveBar(_props: SaveBarProps) {
  return null;
}
