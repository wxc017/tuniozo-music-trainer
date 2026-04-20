import { useState } from "react";
import type { ReadingFile, ReadingHistoryEntry } from "@/lib/readingWorkflowData";
import { getReadingHistoryDates, getReadingHistoryForDate } from "@/lib/readingWorkflowData";
import { localToday } from "@/lib/storage";

interface Props {
  file: ReadingFile;
  totalPages: number;
  onJumpToPage: (page: number) => void;
  onClose: () => void;
}

function isoToday(): string {
  return localToday();
}

function formatDateHeader(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────

function Calendar({
  year, month, datesWithEntries, selectedDate, onSelectDate,
}: {
  year: number;
  month: number;
  datesWithEntries: Set<string>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const today = isoToday();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  function toISO(d: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, color: "#444", padding: "3px 0", fontWeight: 700, letterSpacing: 1 }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={`e-${i}`} />;
          const iso = toISO(d);
          const hasEntry = datesWithEntries.has(iso);
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          return (
            <button
              key={iso}
              onClick={() => onSelectDate(iso)}
              style={{
                position: "relative",
                padding: "6px 2px",
                borderRadius: 5,
                border: isSelected
                  ? "1.5px solid #5a8a5a"
                  : isToday
                    ? "1.5px solid #2a3a2a"
                    : "1.5px solid transparent",
                background: isSelected ? "#1a2a1a" : isToday ? "#111a11" : "#0e0e0e",
                color: isSelected ? "#8dcc8d" : isToday ? "#5a8a5a" : hasEntry ? "#aaa" : "#444",
                fontSize: 11,
                fontWeight: isToday ? 700 : 400,
                cursor: "pointer",
                textAlign: "center",
                transition: "all 60ms",
              }}
            >
              {d}
              {hasEntry && (
                <div style={{
                  position: "absolute",
                  bottom: 2,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: isSelected ? "#8dcc8d" : "#5a8a5a",
                }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────

function ProgressBar({ page, totalPages }: { page: number; totalPages: number }) {
  const pct = totalPages > 0 ? Math.min(100, (page / totalPages) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
      <div style={{
        flex: 1, height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: "#5a8a5a",
          borderRadius: 3, transition: "width 200ms",
        }} />
      </div>
      <span style={{ fontSize: 10, color: "#666", whiteSpace: "nowrap" }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────

export default function ReadingHistoryModal({ file, totalPages, onJumpToPage, onClose }: Props) {
  const today = isoToday();
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const datesWithEntries = getReadingHistoryDates(file);
  const entry = getReadingHistoryForDate(file, selectedDate);

  // Count stats for the current month
  const history = file.readingHistory || [];
  const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
  const monthEntries = history.filter(h => h.date.startsWith(monthPrefix));
  const daysActive = monthEntries.length;

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };
  const goToToday = () => {
    const n = new Date();
    setCalYear(n.getFullYear());
    setCalMonth(n.getMonth());
    setSelectedDate(isoToday());
  };

  const isCurrentMonth = calYear === now.getFullYear() && calMonth === now.getMonth();
  const monthLabel = new Date(calYear, calMonth).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0e0e0e", border: "1px solid #222", borderRadius: 10,
          width: 680, maxHeight: "80vh", display: "flex", overflow: "hidden",
        }}
      >
        {/* Left: Calendar */}
        <div style={{
          width: 280, borderRight: "1px solid #1a1a1a", padding: "16px 14px",
          display: "flex", flexDirection: "column", gap: 10, overflowY: "auto",
        }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={prevMonth} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 16, padding: "2px 8px" }}>&lt;</button>
            <span style={{ fontSize: 13, color: "#aaa", fontWeight: 600 }}>{monthLabel}</span>
            <button onClick={nextMonth} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 16, padding: "2px 8px" }}>&gt;</button>
          </div>

          {!isCurrentMonth && (
            <button
              onClick={goToToday}
              style={{
                background: "#1a2a1a", border: "1px solid #2a3a2a", borderRadius: 4,
                color: "#5a8a5a", fontSize: 10, padding: "3px 8px", cursor: "pointer",
                alignSelf: "center",
              }}
            >
              Today
            </button>
          )}

          <Calendar
            year={calYear}
            month={calMonth}
            datesWithEntries={datesWithEntries}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />

          <div style={{ fontSize: 10, color: "#555", textAlign: "center", marginTop: 4 }}>
            {daysActive} day{daysActive !== 1 ? "s" : ""} active this month
          </div>

          {/* Overall progress */}
          {totalPages > 0 && (
            <div style={{ marginTop: 8, padding: "8px 6px", background: "#111", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>Current progress</div>
              <div style={{ fontSize: 13, color: "#ccc" }}>
                Page {file.lastPage} of {totalPages}
              </div>
              <ProgressBar page={file.lastPage} totalPages={totalPages} />
            </div>
          )}
        </div>

        {/* Right: Day details */}
        <div style={{ flex: 1, padding: "16px 18px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>
                {formatDateHeader(selectedDate)}
                {selectedDate === today && (
                  <span style={{
                    marginLeft: 8, fontSize: 9, background: "#5a8a5a", color: "#000",
                    padding: "1px 6px", borderRadius: 3, fontWeight: 700, verticalAlign: "middle",
                  }}>
                    TODAY
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{file.title}</div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", color: "#555", cursor: "pointer",
                fontSize: 18, padding: "2px 6px", lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          {entry ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Page range */}
              <div style={{
                background: "#111", borderRadius: 8, padding: "14px 16px",
                border: "1px solid #1a1a1a",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>Reading session</div>
                    <div style={{ fontSize: 20, color: "#ccc", fontWeight: 600 }}>
                      {entry.startPage === entry.page
                        ? `Page ${entry.page}`
                        : `Page ${entry.startPage} → ${entry.page}`}
                    </div>
                    {entry.startPage !== entry.page && (
                      <div style={{ fontSize: 11, color: "#5a8a5a", marginTop: 4 }}>
                        {Math.abs(entry.page - entry.startPage)} pages read
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { onJumpToPage(entry.page); onClose(); }}
                    style={{
                      background: "#1a2a1a", border: "1px solid #2a3a2a", borderRadius: 6,
                      color: "#5a8a5a", fontSize: 12, padding: "8px 14px", cursor: "pointer",
                      fontWeight: 600, transition: "all 100ms",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#2a3a2a"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#1a2a1a"; }}
                  >
                    Jump to p.{entry.page}
                  </button>
                </div>
                {totalPages > 0 && <ProgressBar page={entry.page} totalPages={totalPages} />}
              </div>

              {/* Time */}
              <div style={{ fontSize: 10, color: "#444" }}>
                Last updated {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ) : (
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              color: "#333", fontSize: 13,
            }}>
              No reading recorded
            </div>
          )}

          {/* Timeline: recent history */}
          {history.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 8, fontWeight: 600 }}>
                Reading timeline
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {[...history]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 30)
                  .map(h => {
                    const isSelected = h.date === selectedDate;
                    const pagesRead = Math.abs(h.page - h.startPage);
                    return (
                      <button
                        key={h.date}
                        onClick={() => {
                          setSelectedDate(h.date);
                          const [y, m] = h.date.split("-").map(Number);
                          setCalYear(y);
                          setCalMonth(m - 1);
                        }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "6px 10px", borderRadius: 5,
                          background: isSelected ? "#1a2a1a" : "#0e0e0e",
                          border: isSelected ? "1px solid #2a3a2a" : "1px solid #151515",
                          cursor: "pointer", transition: "all 60ms",
                        }}
                      >
                        <span style={{ fontSize: 11, color: isSelected ? "#8dcc8d" : "#777" }}>
                          {new Date(h.date + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                        <span style={{ fontSize: 11, color: "#555" }}>
                          p.{h.startPage === h.page ? h.page : `${h.startPage}–${h.page}`}
                          {pagesRead > 0 && (
                            <span style={{ color: "#5a8a5a", marginLeft: 6 }}>+{pagesRead}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
