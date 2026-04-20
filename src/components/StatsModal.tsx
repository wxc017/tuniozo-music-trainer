import { useState } from "react";
import {
  getDailyStats, getOptionStats, getDayTotals,
  getWeekDays, getMonthDays, accuracy,
  clearAllStats, removeOneAnswer, clearDayOption, clearDay
} from "@/lib/stats";
import { getKnownOptions, localToday } from "@/lib/storage";

interface Props { onClose: () => void; }

type View = "Today" | "Week" | "Month" | "Options";

export default function StatsModal({ onClose }: Props) {
  const [view, setView] = useState<View>("Today");
  const [monthOff, setMonthOff] = useState(0);
  const [drillDay, setDrillDay] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const today = localToday();
  const refresh = () => setTick(t => t + 1);
  void tick;

  const nav = ["Today","Week","Month","Options"] as View[];

  const daily   = getDailyStats();
  const options = getOptionStats();

  // ── Shared: editable rows for one day ─────────────────────────────────
  const renderDayRows = (dateStr: string) => {
    const dayData = daily[dateStr] ?? {};
    const known = getKnownOptions();

    // Show all currently-selected options; played ones show counts, unplayed show 0/0
    const allKeys = new Set([...Object.keys(dayData), ...Object.keys(known)]);
    const merged = Array.from(allKeys).map(key => {
      const d = dayData[key];
      return {
        key,
        label: d?.label ?? known[key] ?? key,
        correct: d?.correct ?? 0,
        wrong: d?.wrong ?? 0,
        played: !!d && (d.correct + d.wrong) > 0,
      };
    }).sort((a, b) => {
      if (a.played !== b.played) return a.played ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    const totC = merged.reduce((s, e) => s + e.correct, 0);
    const totW = merged.reduce((s, e) => s + e.wrong, 0);

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-5 text-sm">
            <span className="text-[#5cca5c]">✓ {totC}</span>
            <span className="text-[#e06060]">✗ {totW}</span>
            <span className="text-[#888]">{accuracy(totC, totW)}</span>
          </div>
          {(totC + totW) > 0 && (
            <button
              onClick={() => {
                if (confirm(`Clear all stats for ${dateStr}?`)) {
                  clearDay(dateStr);
                  setDrillDay(null);
                  refresh();
                }
              }}
              className="text-xs text-[#555] hover:text-[#e06060] transition-colors"
            >
              Clear Day
            </button>
          )}
        </div>

        {!merged.length && (
          <p className="text-[#555] text-xs">No answers recorded for this day.</p>
        )}

        <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
          {merged.map(({ key, label, correct, wrong, played }) => (
            <div key={key} className={`border rounded px-3 py-2 text-xs ${
              played ? "bg-[#141414] border-[#222]" : "bg-[#111] border-[#1a1a1a]"
            }`}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className={`truncate flex-1 mr-2 ${played ? "text-[#aaa]" : "text-[#444]"}`}>{label}</span>
                <span className="flex gap-3 flex-shrink-0">
                  <span className={played ? "text-[#5cca5c]" : "text-[#2a2a2a]"}>✓{correct}</span>
                  <span className={played ? "text-[#e06060]" : "text-[#2a2a2a]"}>✗{wrong}</span>
                  <span className={played ? "text-[#888]" : "text-[#2a2a2a]"}>{accuracy(correct, wrong)}</span>
                </span>
              </div>
              {played && (
                <div className="flex gap-1.5">
                  <button
                    disabled={correct <= 0}
                    onClick={() => { removeOneAnswer(dateStr, key, "correct"); refresh(); }}
                    className="px-2 py-0.5 rounded text-[10px] bg-[#1a2a1a] border border-[#2a4a2a] text-[#5cca5c] hover:bg-[#223a22] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    −✓
                  </button>
                  <button
                    disabled={wrong <= 0}
                    onClick={() => { removeOneAnswer(dateStr, key, "wrong"); refresh(); }}
                    className="px-2 py-0.5 rounded text-[10px] bg-[#2a1a1a] border border-[#4a2a2a] text-[#e06060] hover:bg-[#3a2222] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    −✗
                  </button>
                  <button
                    onClick={() => { clearDayOption(dateStr, key); refresh(); }}
                    className="px-2 py-0.5 rounded text-[10px] bg-[#1e1e1e] border border-[#333] text-[#666] hover:text-[#e06060] hover:border-[#e06060] transition-colors"
                  >
                    ✕ row
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── TODAY ──────────────────────────────────────────────────────────────
  const renderToday = () => renderDayRows(today);

  // ── WEEK ──────────────────────────────────────────────────────────────
  const renderWeek = () => {
    const days = getWeekDays();

    if (drillDay) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setDrillDay(null)} className="text-xs text-[#666] hover:text-[#aaa] transition-colors">
              ← Back
            </button>
            <span className="text-sm font-medium text-[#ccc]">{drillDay}{drillDay === today ? " (today)" : ""}</span>
          </div>
          {renderDayRows(drillDay)}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {days.map(d => {
          const { correct, wrong } = getDayTotals(d);
          const isToday = d === today;
          const total = correct + wrong;
          return (
            <div
              key={d}
              onClick={() => total > 0 && setDrillDay(d)}
              className={`flex items-center gap-3 px-3 py-2 rounded text-xs border transition-colors ${
                isToday ? "border-[#7173e6] bg-[#1a1a2a]" : "border-[#1e1e1e] bg-[#141414]"
              } ${total > 0 ? "cursor-pointer hover:border-[#555]" : ""}`}
            >
              <span className="w-28 text-[#888]">{d.slice(5)}{isToday ? " (today)" : ""}</span>
              <div className="flex-1 h-2 bg-[#1e1e1e] rounded-full overflow-hidden">
                {total > 0 && (
                  <div className="h-full rounded-full" style={{
                    width: `${Math.round(100 * correct / total)}%`,
                    background: "linear-gradient(to right,#5cca5c,#7173e6)"
                  }} />
                )}
              </div>
              <span className="w-24 text-right text-[#888]">
                {total ? `${correct}✓ ${wrong}✗ ${accuracy(correct, wrong)}` : "—"}
              </span>
              {total > 0 && <span className="text-[#444] text-[10px]">✎</span>}
            </div>
          );
        })}
        <p className="text-[10px] text-[#444] pt-1">Click a day to edit its entries.</p>
      </div>
    );
  };

  // ── MONTH ──────────────────────────────────────────────────────────────
  const renderMonth = () => {
    const now = new Date();
    now.setMonth(now.getMonth() + monthOff);
    const yr = now.getFullYear();
    const mo = now.getMonth() + 1;
    const label = `${yr}-${String(mo).padStart(2,"0")}`;
    const days = getMonthDays(yr, mo);
    const firstDow = new Date(yr, mo - 1, 1).getDay();

    if (drillDay) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setDrillDay(null)} className="text-xs text-[#666] hover:text-[#aaa] transition-colors">
              ← Back
            </button>
            <span className="text-sm font-medium text-[#ccc]">{drillDay}{drillDay === today ? " (today)" : ""}</span>
          </div>
          {renderDayRows(drillDay)}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setMonthOff(m => m - 1)} className="text-[#666] hover:text-white px-2">◀</button>
          <span className="text-sm font-medium text-[#ccc]">{label}</span>
          <button onClick={() => setMonthOff(m => Math.min(0, m + 1))} className="text-[#666] hover:text-white px-2">▶</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["S","M","T","W","T","F","S"].map((d,i) => (
            <div key={i} className="text-center text-[#555] py-1">{d}</div>
          ))}
          {Array.from({length: firstDow}, (_, i) => <div key={`e${i}`} />)}
          {days.map(d => {
            const { correct, wrong } = getDayTotals(d);
            const total = correct + wrong;
            const day = d.slice(8);
            const isToday = d === today;
            return (
              <div
                key={d}
                onClick={() => total > 0 && setDrillDay(d)}
                className={`rounded p-1 text-center ${isToday ? "border border-[#7173e6]" : ""} ${
                  total ? "bg-[#1a1a2a] cursor-pointer hover:bg-[#222240]" : "bg-[#111]"
                } transition-colors`}
              >
                <div className={`font-medium ${isToday ? "text-[#9999ee]" : "text-[#666]"}`}>{day}</div>
                {total > 0 && (
                  <>
                    <div className="text-[#5cca5c] text-[9px]">{correct}✓</div>
                    <div className="text-[#e06060] text-[9px]">{wrong}✗</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[#444]">Click a day to edit its entries.</p>
      </div>
    );
  };

  // ── OPTIONS ────────────────────────────────────────────────────────────
  const renderOptions = () => {
    const played = Object.entries(options)
      .map(([key, e]) => ({ key, ...e }))
      .filter(e => (e.correct + e.wrong) > 0)
      .sort((a, b) => {
        const totA = a.correct + a.wrong;
        const totB = b.correct + b.wrong;
        if (totA !== totB) return totB - totA;
        return a.label.localeCompare(b.label);
      });

    if (!played.length) return (
      <p className="text-[#555] text-xs">No data yet. Practice a few rounds and answers will appear here.</p>
    );

    return (
      <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
        {played.map(({ key, label, correct, wrong, last_seen }) => {
          const total = correct + wrong;
          const pct = total ? Math.round(100 * correct / total) : 0;
          return (
            <div key={key} className="bg-[#141414] border border-[#222] rounded px-3 py-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#aaa] truncate mr-2">{label}</span>
                <span className="flex gap-3 flex-shrink-0">
                  <span className="text-[#5cca5c]">✓{correct}</span>
                  <span className="text-[#e06060]">✗{wrong}</span>
                  <span className={pct >= 70 ? "text-[#5cca5c]" : pct >= 50 ? "text-[#e0c060]" : "text-[#e06060]"}>
                    {accuracy(correct, wrong)}
                  </span>
                </span>
              </div>
              <div className="h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full" style={{
                  width: `${pct}%`,
                  background: pct >= 70 ? "#5cca5c" : pct >= 50 ? "#e0c060" : "#e06060"
                }} />
              </div>
              <div className="text-[#444]">Last seen: {last_seen}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#111] border border-[#2a2a2a] rounded-xl w-full max-w-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e]">
          <h2 className="font-semibold text-sm">Practice Stats</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { if (confirm("Clear ALL stats?")) { clearAllStats(); setDrillDay(null); refresh(); } }}
              className="text-xs text-[#555] hover:text-[#e06060] transition-colors"
            >
              Clear All
            </button>
            <button onClick={onClose} className="text-[#555] hover:text-white text-lg leading-none">✕</button>
          </div>
        </div>

        {/* Nav */}
        <div className="flex gap-1 px-4 pt-3">
          {nav.map(v => (
            <button key={v} onClick={() => { setView(v); setDrillDay(null); }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                view === v ? "bg-[#7173e6] text-white" : "bg-[#161616] border border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
              }`}>{v}</button>
          ))}
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {view === "Today"   && renderToday()}
          {view === "Week"    && renderWeek()}
          {view === "Month"   && renderMonth()}
          {view === "Options" && renderOptions()}
        </div>
      </div>
    </div>
  );
}
