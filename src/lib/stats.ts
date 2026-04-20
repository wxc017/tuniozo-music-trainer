import { lsGet, lsSet, localToday } from "./storage";

// ── Types ──────────────────────────────────────────────────────────────

export interface DayEntry {
  correct: number;
  wrong: number;
  label: string;
}

export interface OptionEntry {
  correct: number;
  wrong: number;
  label: string;
  first_seen: string;
  last_seen: string;
}

// all_stats:        { date: { option_key: DayEntry } }
// all_option_stats: { option_key: OptionEntry }

type DailyStats   = Record<string, Record<string, DayEntry>>;
type OptionStats  = Record<string, OptionEntry>;

function today(): string {
  return localToday();
}

export function getDailyStats(): DailyStats {
  return lsGet<DailyStats>("lt_stats", {});
}

export function getOptionStats(): OptionStats {
  return lsGet<OptionStats>("lt_option_stats", {});
}

export function recordAnswer(
  optionKey: string,
  label: string,
  correct: boolean
): void {
  const now = today();

  const daily = getDailyStats();
  daily[now] = daily[now] ?? {};
  if (!daily[now][optionKey]) {
    daily[now][optionKey] = { correct: 0, wrong: 0, label };
  }
  daily[now][optionKey][correct ? "correct" : "wrong"] += 1;
  lsSet("lt_stats", daily);

  const opts = getOptionStats();
  if (!opts[optionKey]) {
    opts[optionKey] = { correct: 0, wrong: 0, label, first_seen: now, last_seen: now };
  }
  opts[optionKey][correct ? "correct" : "wrong"] += 1;
  opts[optionKey].last_seen = now;
  lsSet("lt_option_stats", opts);
}

export function undoLastAnswer(
  optionKey: string,
  correct: boolean
): void {
  const now = today();
  const field = correct ? "correct" : "wrong";

  const daily = getDailyStats();
  if (daily[now]?.[optionKey]) {
    daily[now][optionKey][field] = Math.max(0, daily[now][optionKey][field] - 1);
  }
  lsSet("lt_stats", daily);

  const opts = getOptionStats();
  if (opts[optionKey]) {
    opts[optionKey][field] = Math.max(0, opts[optionKey][field] - 1);
  }
  lsSet("lt_option_stats", opts);
}

export function clearAllStats(): void {
  lsSet("lt_stats", {});
  lsSet("lt_option_stats", {});
}

export function removeOneAnswer(
  dateStr: string,
  optionKey: string,
  field: "correct" | "wrong"
): void {
  const daily = getDailyStats();
  const entry = daily[dateStr]?.[optionKey];
  if (!entry) return;
  if (entry[field] <= 0) return;
  entry[field] -= 1;
  lsSet("lt_stats", daily);

  const opts = getOptionStats();
  if (opts[optionKey]) {
    opts[optionKey][field] = Math.max(0, opts[optionKey][field] - 1);
    lsSet("lt_option_stats", opts);
  }
}

export function clearDayOption(dateStr: string, optionKey: string): void {
  const daily = getDailyStats();
  const entry = daily[dateStr]?.[optionKey];
  if (!entry) return;

  const opts = getOptionStats();
  if (opts[optionKey]) {
    opts[optionKey].correct = Math.max(0, opts[optionKey].correct - entry.correct);
    opts[optionKey].wrong   = Math.max(0, opts[optionKey].wrong   - entry.wrong);
    lsSet("lt_option_stats", opts);
  }

  delete daily[dateStr][optionKey];
  lsSet("lt_stats", daily);
}

export function clearDay(dateStr: string): void {
  const daily = getDailyStats();
  const dayData = daily[dateStr] ?? {};

  const opts = getOptionStats();
  for (const [key, entry] of Object.entries(dayData)) {
    if (opts[key]) {
      opts[key].correct = Math.max(0, opts[key].correct - entry.correct);
      opts[key].wrong   = Math.max(0, opts[key].wrong   - entry.wrong);
    }
  }
  lsSet("lt_option_stats", opts);

  delete daily[dateStr];
  lsSet("lt_stats", daily);
}

export function removeSlotAnswers(
  dateStr: string,
  stats: Array<{ key: string; c: number; w: number }>
): void {
  const daily = getDailyStats();
  const opts = getOptionStats();

  for (const { key, c, w } of stats) {
    if (daily[dateStr]?.[key]) {
      daily[dateStr][key].correct = Math.max(0, daily[dateStr][key].correct - c);
      daily[dateStr][key].wrong   = Math.max(0, daily[dateStr][key].wrong - w);
      // Clean up if zeroed out
      if (daily[dateStr][key].correct === 0 && daily[dateStr][key].wrong === 0) {
        delete daily[dateStr][key];
      }
    }
    if (opts[key]) {
      opts[key].correct = Math.max(0, opts[key].correct - c);
      opts[key].wrong   = Math.max(0, opts[key].wrong - w);
    }
  }

  // Clean up empty day
  if (daily[dateStr] && Object.keys(daily[dateStr]).length === 0) {
    delete daily[dateStr];
  }

  lsSet("lt_stats", daily);
  lsSet("lt_option_stats", opts);
}

// ── Import bias ───────────────────────────────────────────────────────
// When restoring a practice log entry, biasKeys maps option keys to
// { c, w } from the logged slot.  weightedRandomChoice boosts items
// that appear in the bias map (higher error → higher weight).

export function setImportBias(biasKeys: Record<string, { c: number; w: number }> | null): void {
  if (biasKeys && Object.keys(biasKeys).length > 0) {
    lsSet("lt_import_bias", biasKeys);
  } else {
    localStorage.removeItem("lt_import_bias");
  }
}

export function getImportBias(): Record<string, { c: number; w: number }> | null {
  return lsGet<Record<string, { c: number; w: number }> | null>("lt_import_bias", null);
}

export function clearImportBias(): void {
  localStorage.removeItem("lt_import_bias");
}

// ── Weighted random selection ──────────────────────────────────────────
// Items not yet played get weight 1.0; each additional play halves the
// relative weight (1/(n+1)), so unplayed items are strongly preferred.
// If import bias is active, items with errors get a multiplicative boost
// proportional to their error rate.
export function weightedRandomChoice<T>(
  items: T[],
  keyFn: (item: T) => string
): T {
  if (!items.length) throw new Error("weightedRandomChoice: empty array");
  if (items.length === 1) return items[0];
  const opts = getOptionStats();
  const bias = getImportBias();
  const weights = items.map(item => {
    const key = keyFn(item);
    const total = (opts[key]?.correct ?? 0) + (opts[key]?.wrong ?? 0);
    let w = 1 / (total + 1);
    // Boost items that appear in import bias (higher error rate → bigger boost)
    if (bias && bias[key]) {
      const { c, w: wrong } = bias[key];
      const errorRate = (c + wrong) > 0 ? wrong / (c + wrong) : 0.5;
      w *= 1 + errorRate * 4; // up to 5x boost for 100% error rate
    }
    return w;
  });
  const sum = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── Aggregation helpers ────────────────────────────────────────────────

export function getDayTotals(dateStr: string): { correct: number; wrong: number } {
  const day = getDailyStats()[dateStr] ?? {};
  let correct = 0; let wrong = 0;
  for (const e of Object.values(day)) { correct += e.correct; wrong += e.wrong; }
  return { correct, wrong };
}

export function getWeekDays(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return days;
}

export function getMonthDays(year: number, month: number): string[] {
  const days: string[] = [];
  const last = new Date(year, month, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const mm = String(month).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    days.push(`${year}-${mm}-${dd}`);
  }
  return days;
}

export function accuracy(c: number, w: number): string {
  const tot = c + w;
  if (!tot) return "—";
  return `${Math.round((100 * c) / tot)}%`;
}
