import { localToday } from "@/lib/storage";

// ── Reading Workflow Data Layer ──────────────────────────────────────────

export interface PenStroke {
  points: { x: number; y: number; pressure: number }[];
  color: string;
  width: number;
}

export interface TextExtract {
  id: string;
  number: number;       // T1, T2, T3…
  text: string;
  imageDataUrl?: string; // screenshot of selected region
  pageNumber?: number;
  timestamp: number;
  date: string;          // YYYY-MM-DD
}

export interface NoteEntry {
  id: string;
  number: number;       // N1, N2, N3…
  selectedText: string;
  imageDataUrl?: string; // screenshot of selected region
  note: string;          // typed note
  penStrokes?: PenStroke[];
  pageNumber?: number;
  timestamp: number;
  date: string;          // YYYY-MM-DD
}

export interface QuestionEntry {
  id: string;
  number: number;       // Q1, Q2, Q3…
  selectedText: string;
  imageDataUrl?: string; // screenshot of selected region
  question: string;      // typed question
  penStrokes?: PenStroke[];
  pageNumber?: number;
  timestamp: number;
  date: string;          // YYYY-MM-DD
}

export interface ExplorationEntry {
  id: string;
  number: number;       // E1, E2, E3…
  selectedText: string;
  imageDataUrl?: string;
  exploration: string;   // typed exploration text
  penStrokes?: PenStroke[];
  pageNumber?: number;
  timestamp: number;
  date: string;          // YYYY-MM-DD
}

export interface Highlight {
  id: string;
  page: number;
  /** Region as fraction of page dimensions (0–1) so it survives zoom changes */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  color: string;             // hex color
  /** What created this highlight */
  kind: "T" | "N" | "Q" | "E";
  /** ID of the linked TextExtract / NoteEntry / QuestionEntry */
  linkedId: string;
  label: string;             // short preview text shown on hover
  createdAt: number;
}

export interface Bookmark {
  id: string;
  page: number;
  label: string;
  createdAt: number;
}

export interface ReadingHistoryEntry {
  date: string;       // YYYY-MM-DD
  page: number;       // page they were on at end of session
  startPage: number;  // page when they opened that day
  timestamp: number;  // last update time
}

export interface CitationMeta {
  subtitle?: string;
  editors?: string;
  publisher?: string;
  year?: string;
  edition?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  isbn?: string;
  issn?: string;
  url?: string;
  journal?: string;
  conference?: string;
  institution?: string;       // for theses / working papers
  accessDate?: string;        // for web sources
  abstract?: string;
}

export interface ReadingFile {
  id: string;
  title: string;
  author: string;
  category: string;
  fileName: string;
  fileType: "pdf" | "epub" | "mobi";
  citation?: CitationMeta;
  textExtracts: TextExtract[];
  notes: NoteEntry[];
  questions: QuestionEntry[];
  explorations: ExplorationEntry[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  readingHistory: ReadingHistoryEntry[];
  lastPage: number;
  lastScrollFraction: number;
  sidePanelOpen: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── localStorage CRUD (metadata only — binary in IndexedDB) ─────────────

const LS_KEY = "lt_reading_files";

export function loadReadingFiles(): ReadingFile[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ReadingFile[]) : [];
  } catch {
    return [];
  }
}

export function saveReadingFile(file: ReadingFile): void {
  const all = loadReadingFiles();
  const idx = all.findIndex(f => f.id === file.id);
  if (idx >= 0) all[idx] = file;
  else all.push(file);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export function deleteReadingFile(id: string): void {
  localStorage.setItem(LS_KEY, JSON.stringify(loadReadingFiles().filter(f => f.id !== id)));
}

export function newReadingFile(
  title: string,
  author: string,
  category: string,
  fileName: string,
  fileType: ReadingFile["fileType"],
  citation?: CitationMeta,
): ReadingFile {
  return {
    id: crypto.randomUUID(),
    title,
    author,
    category,
    fileName,
    fileType,
    citation: citation && Object.keys(citation).length > 0 ? citation : undefined,
    textExtracts: [],
    notes: [],
    questions: [],
    explorations: [],
    bookmarks: [],
    highlights: [],
    readingHistory: [],
    lastPage: 0,
    lastScrollFraction: 0,
    sidePanelOpen: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function nextTextExtractNumber(file: ReadingFile): number {
  return file.textExtracts.length + 1;
}

export function nextNoteNumber(file: ReadingFile): number {
  return file.notes.length + 1;
}

export function nextQuestionNumber(file: ReadingFile): number {
  return (file.questions || []).length + 1;
}

export function nextExplorationNumber(file: ReadingFile): number {
  return (file.explorations || []).length + 1;
}

export function groupByDay<T extends { date: string }>(entries: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const e of entries) {
    (groups[e.date] ??= []).push(e);
  }
  return groups;
}

// ── Reading history helpers ───────────────────────────────────────────────

/** Record or update today's reading history entry for a file */
export function recordReadingHistory(file: ReadingFile, page: number): ReadingFile {
  const today = localToday();
  const history = file.readingHistory ? [...file.readingHistory] : [];
  const idx = history.findIndex(h => h.date === today);
  if (idx >= 0) {
    history[idx] = { ...history[idx], page, timestamp: Date.now() };
  } else {
    history.push({ date: today, page, startPage: page, timestamp: Date.now() });
  }
  return { ...file, readingHistory: history };
}

/** Get all dates that have reading history */
export function getReadingHistoryDates(file: ReadingFile): Set<string> {
  return new Set((file.readingHistory || []).map(h => h.date));
}

/** Get reading history for a specific date */
export function getReadingHistoryForDate(file: ReadingFile, date: string): ReadingHistoryEntry | null {
  return (file.readingHistory || []).find(h => h.date === date) ?? null;
}

export function getCategories(): string[] {
  const files = loadReadingFiles();
  return [...new Set(files.map(f => f.category))].sort();
}

export function getAuthorsByCategory(category: string): string[] {
  const files = loadReadingFiles();
  return [...new Set(
    files.filter(f => f.category === category && f.author).map(f => f.author)
  )].sort();
}

// ── Citation formatting helpers ──────────────────────────────────────────

/** Format as APA 7th edition */
export function formatAPA(file: ReadingFile): string {
  const c = file.citation ?? {};
  const author = file.author || "Unknown";
  const year = c.year ? `(${c.year})` : "(n.d.)";
  const title = file.title;

  if (c.journal) {
    // Journal article
    const vol = c.volume ? `, ${c.volume}` : "";
    const iss = c.issue ? `(${c.issue})` : "";
    const pp = c.pages ? `, ${c.pages}` : "";
    const doi = c.doi ? ` https://doi.org/${c.doi}` : "";
    return `${author} ${year}. ${title}. *${c.journal}*${vol}${iss}${pp}.${doi}`;
  }
  // Book
  const ed = c.edition ? ` (${c.edition} ed.)` : "";
  const pub = c.publisher ? ` ${c.publisher}.` : "";
  const doi = c.doi ? ` https://doi.org/${c.doi}` : "";
  return `${author} ${year}. *${title}*${ed}.${pub}${doi}`;
}

/** Format as MLA 9th edition */
export function formatMLA(file: ReadingFile): string {
  const c = file.citation ?? {};
  const author = file.author || "Unknown";
  const title = file.title;

  if (c.journal) {
    const vol = c.volume ? `, vol. ${c.volume}` : "";
    const iss = c.issue ? `, no. ${c.issue}` : "";
    const pp = c.pages ? `, pp. ${c.pages}` : "";
    const year = c.year ? `, ${c.year}` : "";
    const doi = c.doi ? ` https://doi.org/${c.doi}` : "";
    return `${author}. "${title}." *${c.journal}*${vol}${iss}${year}${pp}.${doi}`;
  }
  const pub = c.publisher ?? "";
  const year = c.year ?? "";
  const pubYear = [pub, year].filter(Boolean).join(", ");
  return `${author}. *${title}*. ${pubYear ? pubYear + "." : ""}`;
}

/** Format as Chicago/Turabian */
export function formatChicago(file: ReadingFile): string {
  const c = file.citation ?? {};
  const author = file.author || "Unknown";
  const title = file.title;

  if (c.journal) {
    const vol = c.volume ? ` ${c.volume}` : "";
    const iss = c.issue ? `, no. ${c.issue}` : "";
    const year = c.year ? ` (${c.year})` : "";
    const pp = c.pages ? `: ${c.pages}` : "";
    const doi = c.doi ? `. https://doi.org/${c.doi}` : "";
    return `${author}. "${title}." *${c.journal}*${vol}${iss}${year}${pp}${doi}.`;
  }
  const pub = c.publisher ?? "";
  const year = c.year ?? "";
  const pubInfo = [pub, year].filter(Boolean).join(", ");
  return `${author}. *${title}*. ${pubInfo ? pubInfo + "." : ""}`;
}
