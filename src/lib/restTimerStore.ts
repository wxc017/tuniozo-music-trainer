// Global rest-timer state so the countdown survives navigating away from the
// timer, opening the video popup, or switching Workout Log views. A single
// floating widget (FloatingRestTimer) renders it; any component can start it.
//
// Time is anchored to a wall-clock end timestamp, so the displayed remaining
// time stays correct even if the tab was backgrounded and timers throttled.

import { scheduleRestNotification, ensureNotifyPermission } from "./restNotify";

let endsAt: number | null = null;  // ms epoch, or null when idle
let totalSec = 0;
let cancelNotif: (() => void) | null = null;

const listeners = new Set<() => void>();
function emit(): void { listeners.forEach(l => l()); }

export function subscribeRest(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
/** Stable snapshot for useSyncExternalStore (changes only on start/stop). */
export function restEndsAt(): number | null { return endsAt; }
export function restTotalSec(): number { return totalSec; }

export function startRest(seconds: number): void {
  if (!(seconds > 0)) return;
  endsAt = Date.now() + seconds * 1000;
  totalSec = seconds;
  void ensureNotifyPermission();
  cancelNotif?.();
  cancelNotif = scheduleRestNotification(seconds);
  emit();
}

export function addRest(seconds: number): void {
  if (endsAt == null) return;
  endsAt += seconds * 1000;
  const left = Math.max(0, (endsAt - Date.now()) / 1000);
  cancelNotif?.();
  cancelNotif = scheduleRestNotification(left);
  emit();
}

export function stopRest(): void {
  endsAt = null;
  totalSec = 0;
  cancelNotif?.();
  cancelNotif = null;
  emit();
}
