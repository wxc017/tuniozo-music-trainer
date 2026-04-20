import { useState, useCallback, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import {
  ReadingFile, loadReadingFiles, saveReadingFile, recordReadingHistory,
  nextTextExtractNumber, nextNoteNumber, nextQuestionNumber, nextExplorationNumber,
  type TextExtract, type NoteEntry, type QuestionEntry, type ExplorationEntry, type PenStroke, type Bookmark,
  type Highlight, type CitationMeta, formatAPA, formatMLA, formatChicago,
} from "@/lib/readingWorkflowData";
import { getFileBlob } from "@/lib/fileStorage";
import { localToday } from "@/lib/storage";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import FileLibrary from "./reading/FileLibrary";
import PdfViewer, { type TocEntry, type SearchMatch } from "./reading/PdfViewer";
import EpubViewer from "./reading/EpubViewer";
import SelectionOverlay, { type RegionInfo } from "./reading/SelectionOverlay";
import SidePanel from "./reading/SidePanel";
import NoteEditor from "./reading/NoteEditor";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./ui/resizable";
import ReadingHistoryModal from "./reading/ReadingHistoryModal";

export default function ReadingWorkflow() {
  const [files, setFiles] = useState<ReadingFile[]>(() => loadReadingFiles());
  const [activeFile, setActiveFile] = useState<ReadingFile | null>(null);
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(false);

  // Note/Question editor state
  const [noteEditorText, setNoteEditorText] = useState<string | null>(null);
  const [noteEditorPage, setNoteEditorPage] = useState(0);
  const [noteEditorMode, setNoteEditorMode] = useState<"N" | "Q" | "E">("N");
  const [noteEditorImageDataUrl, setNoteEditorImageDataUrl] = useState<string | undefined>();

  // TOC & drawer state
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [showToc, setShowToc] = useState(false);

  // Citation info modal
  const [showCitation, setShowCitation] = useState(false);

  // Reading history modal
  const [showHistory, setShowHistory] = useState(false);
  const [totalPages, setTotalPages] = useState(0);

  // Reading countdown timer (user-set)
  const [timerDuration, setTimerDuration] = useState(0); // total seconds set
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const [editingTimer, setEditingTimer] = useState(false);
  const [timerInput, setTimerInput] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(0);

  useEffect(() => {
    if (timerRunning && timerRemaining > 0) {
      remainingRef.current = timerRemaining;
      timerRef.current = setInterval(() => {
        remainingRef.current -= 1;
        if (remainingRef.current <= 0) {
          setTimerRemaining(0);
          setTimerRunning(false);
          setTimerExpired(true);
          if (timerRef.current) clearInterval(timerRef.current);
          // beep
          try {
            const ctx = new AudioContext();
            for (let i = 0; i < 3; i++) {
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.connect(g); g.connect(ctx.destination);
              o.frequency.value = 880;
              g.gain.value = 0.3;
              o.start(ctx.currentTime + i * 0.15);
              o.stop(ctx.currentTime + i * 0.15 + 0.08);
            }
          } catch {}
        } else {
          setTimerRemaining(remainingRef.current);
        }
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning, timerDuration]);

  const formatTimer = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const startTimerFromInput = () => {
    const parts = timerInput.trim().split(":").map(Number);
    let totalSecs = 0;
    if (parts.length === 1) totalSecs = (parts[0] || 0) * 60;
    else if (parts.length === 2) totalSecs = (parts[0] || 0) * 60 + (parts[1] || 0);
    else if (parts.length === 3) totalSecs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    if (totalSecs > 0) {
      setTimerDuration(totalSecs);
      setTimerRemaining(totalSecs);
      setTimerRunning(true);
      setTimerExpired(false);
    }
    setEditingTimer(false);
    setTimerInput("");
  };

  // Ref for selection overlay
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // Refs to hold PdfViewer methods
  const scrollToPageRef = useRef<((p: number) => void) | null>(null);
  const highlightTextRef = useRef<((page: number, text: string) => void) | null>(null);

  // Active file ref for auto-save on unmount/close
  const activeFileRef = useRef<ReadingFile | null>(null);
  activeFileRef.current = activeFile;

  // Track latest scroll position in refs (used by debounced save + unmount save)
  const latestPositionRef = useRef<{ page: number; fraction: number }>({ page: 0, fraction: 0 });
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(() => setFiles(loadReadingFiles()), []);

  const openFile = useCallback(async (file: ReadingFile) => {
    setLoading(true);
    const data = await getFileBlob(file.id);
    if (data) {
      // Ensure arrays exist (migration for old data)
      if (!file.bookmarks) file.bookmarks = [];
      if (!file.questions) file.questions = [];
      if (!file.explorations) file.explorations = [];
      // Sanitize stored position — old bug could save bad fraction/page values
      if (file.lastScrollFraction < 0 || file.lastScrollFraction > 1 || !isFinite(file.lastScrollFraction)) {
        file.lastScrollFraction = 0;
      }
      if (file.lastPage < 0 || !isFinite(file.lastPage)) {
        file.lastPage = 0;
      }
      // Seed position ref so closeFile always has the correct page,
      // even if no scroll events fire before the user exits.
      latestPositionRef.current = {
        page: file.lastPage,
        fraction: file.lastScrollFraction,
      };
      // Ensure readingHistory/highlights exist (migration for old data)
      if (!file.readingHistory) file.readingHistory = [];
      if (!file.highlights) file.highlights = [];
      // Don't eagerly create a history entry here — let handlePageChange
      // record it once the viewer confirms the actual visible page.
      setFileData(data);
      setActiveFile(file);
    }
    setLoading(false);
  }, []);

  const closeFile = useCallback(() => {
    // Cancel any pending debounced save
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    // Flush latest scroll position before closing
    if (activeFileRef.current) {
      const pos = latestPositionRef.current;
      if (pos.page > 0) {
        activeFileRef.current.lastPage = pos.page;
        activeFileRef.current.lastScrollFraction = pos.fraction;
      }
      activeFileRef.current.updatedAt = Date.now();
      saveReadingFile(activeFileRef.current);
    }
    setActiveFile(null);
    setFileData(null);
    setToc([]);
    setShowToc(false);
    setTotalPages(0);
    scrollToPageRef.current = null;
    reload();
  }, [reload]);

  const updateFile = useCallback((updated: ReadingFile) => {
    updated.updatedAt = Date.now();
    saveReadingFile(updated);
    setActiveFile(updated);
  }, []);

  // Highlight color map
  const HIGHLIGHT_COLORS: Record<string, string> = { T: "#7173e6", N: "#5a8a5a", Q: "#c06090", E: "#e0a040" };

  // Pending region for note/question editor (saved until the editor closes)
  const pendingRegionRef = useRef<RegionInfo | undefined>(undefined);

  // Selection overlay hook
  const overlay = SelectionOverlay({
    containerRef: viewerContainerRef,
    onTextAction: (text, action, page, imageDataUrl, region) => {
      if (!activeFile) return;
      if (action === "T") {
        const itemId = crypto.randomUUID();
        const extract: TextExtract = {
          id: itemId,
          number: nextTextExtractNumber(activeFile),
          text,
          imageDataUrl,
          pageNumber: page || undefined,
          timestamp: Date.now(),
          date: localToday(),
        };
        const highlight: Highlight | null = region ? {
          id: crypto.randomUUID(),
          page: region.page,
          xPct: region.xPct, yPct: region.yPct, wPct: region.wPct, hPct: region.hPct,
          color: HIGHLIGHT_COLORS.T,
          kind: "T",
          linkedId: itemId,
          label: `T${extract.number}`,
          createdAt: Date.now(),
        } : null;
        const updated = {
          ...activeFile,
          textExtracts: [...activeFile.textExtracts, extract],
          highlights: [...(activeFile.highlights || []), ...(highlight ? [highlight] : [])],
          sidePanelOpen: true,
        };
        updateFile(updated);
      } else {
        // Stash region for when the note/question editor saves
        pendingRegionRef.current = region;
        setNoteEditorMode(action as "N" | "Q" | "E");
        setNoteEditorText(text);
        setNoteEditorPage(page);
        setNoteEditorImageDataUrl(imageDataUrl);
      }
    },
  });

  const handleSaveNote = useCallback((noteText: string, penStrokes: PenStroke[]) => {
    if (!activeFile || noteEditorText === null) return;
    const region = pendingRegionRef.current;
    pendingRegionRef.current = undefined;

    const itemId = crypto.randomUUID();
    const kind = noteEditorMode;
    const makeHighlight = (kindCode: Highlight["kind"], color: string, label: string): Highlight | null =>
      region ? {
        id: crypto.randomUUID(),
        page: region.page,
        xPct: region.xPct, yPct: region.yPct, wPct: region.wPct, hPct: region.hPct,
        color,
        kind: kindCode,
        linkedId: itemId,
        label,
        createdAt: Date.now(),
      } : null;

    if (kind === "Q") {
      const question: QuestionEntry = {
        id: itemId,
        number: nextQuestionNumber(activeFile),
        selectedText: noteEditorText,
        imageDataUrl: noteEditorImageDataUrl,
        question: noteText,
        penStrokes: penStrokes.length > 0 ? penStrokes : undefined,
        pageNumber: noteEditorPage || undefined,
        timestamp: Date.now(),
        date: localToday(),
      };
      const hl = makeHighlight("Q", HIGHLIGHT_COLORS.Q, `Q${question.number}: ${noteText.slice(0, 60)}`);
      updateFile({
        ...activeFile,
        questions: [...(activeFile.questions || []), question],
        highlights: [...(activeFile.highlights || []), ...(hl ? [hl] : [])],
        sidePanelOpen: true,
      });
    } else if (kind === "E") {
      const exploration: ExplorationEntry = {
        id: itemId,
        number: nextExplorationNumber(activeFile),
        selectedText: noteEditorText,
        imageDataUrl: noteEditorImageDataUrl,
        exploration: noteText,
        penStrokes: penStrokes.length > 0 ? penStrokes : undefined,
        pageNumber: noteEditorPage || undefined,
        timestamp: Date.now(),
        date: localToday(),
      };
      const hl = makeHighlight("E", HIGHLIGHT_COLORS.E, `E${exploration.number}: ${noteText.slice(0, 60)}`);
      updateFile({
        ...activeFile,
        explorations: [...(activeFile.explorations || []), exploration],
        highlights: [...(activeFile.highlights || []), ...(hl ? [hl] : [])],
        sidePanelOpen: true,
      });
    } else {
      const note: NoteEntry = {
        id: itemId,
        number: nextNoteNumber(activeFile),
        selectedText: noteEditorText,
        imageDataUrl: noteEditorImageDataUrl,
        note: noteText,
        penStrokes: penStrokes.length > 0 ? penStrokes : undefined,
        pageNumber: noteEditorPage || undefined,
        timestamp: Date.now(),
        date: localToday(),
      };
      const hl = makeHighlight("N", HIGHLIGHT_COLORS.N, `N${note.number}: ${noteText.slice(0, 60)}`);
      updateFile({
        ...activeFile,
        notes: [...activeFile.notes, note],
        highlights: [...(activeFile.highlights || []), ...(hl ? [hl] : [])],
        sidePanelOpen: true,
      });
    }
    setNoteEditorText(null);
    setNoteEditorImageDataUrl(undefined);
  }, [activeFile, noteEditorText, noteEditorPage, noteEditorMode, noteEditorImageDataUrl, updateFile, HIGHLIGHT_COLORS]);

  const handlePageChange = useCallback((page: number, scrollFraction: number) => {
    // Always update the ref immediately
    latestPositionRef.current = { page, fraction: scrollFraction };
    // Debounce the actual save
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => {
      const file = activeFileRef.current;
      if (!file) return;
      const withHistory = recordReadingHistory(file, page);
      const updated = { ...withHistory, lastPage: page, lastScrollFraction: scrollFraction, updatedAt: Date.now() };
      saveReadingFile(updated);
      setActiveFile(updated);
    }, 500);
  }, []);

  const toggleSidePanel = useCallback(() => {
    if (!activeFile) return;
    updateFile({ ...activeFile, sidePanelOpen: !activeFile.sidePanelOpen });
  }, [activeFile, updateFile]);

  const handleDeleteExtract = useCallback((id: string) => {
    if (!activeFile) return;
    updateFile({
      ...activeFile,
      textExtracts: activeFile.textExtracts.filter(t => t.id !== id),
      highlights: (activeFile.highlights || []).filter(h => h.linkedId !== id),
    });
  }, [activeFile, updateFile]);

  const handleUndoExtract = useCallback((item: TextExtract) => {
    if (!activeFile) return;
    updateFile({ ...activeFile, textExtracts: [...activeFile.textExtracts, item] });
  }, [activeFile, updateFile]);

  const handleDeleteNote = useCallback((id: string) => {
    if (!activeFile) return;
    updateFile({
      ...activeFile,
      notes: activeFile.notes.filter(n => n.id !== id),
      highlights: (activeFile.highlights || []).filter(h => h.linkedId !== id),
    });
  }, [activeFile, updateFile]);

  const handleUndoNote = useCallback((item: NoteEntry) => {
    if (!activeFile) return;
    updateFile({ ...activeFile, notes: [...activeFile.notes, item] });
  }, [activeFile, updateFile]);

  const handleDeleteQuestion = useCallback((id: string) => {
    if (!activeFile) return;
    updateFile({
      ...activeFile,
      questions: (activeFile.questions || []).filter(q => q.id !== id),
      highlights: (activeFile.highlights || []).filter(h => h.linkedId !== id),
    });
  }, [activeFile, updateFile]);

  const handleUndoQuestion = useCallback((item: QuestionEntry) => {
    if (!activeFile) return;
    updateFile({ ...activeFile, questions: [...(activeFile.questions || []), item] });
  }, [activeFile, updateFile]);

  const handleEditNote = useCallback((id: string, note: string) => {
    if (!activeFile) return;
    updateFile({
      ...activeFile,
      notes: activeFile.notes.map(n => n.id === id ? { ...n, note } : n),
    });
  }, [activeFile, updateFile]);

  const handleEditQuestion = useCallback((id: string, question: string) => {
    if (!activeFile) return;
    updateFile({
      ...activeFile,
      questions: (activeFile.questions || []).map(q => q.id === id ? { ...q, question } : q),
    });
  }, [activeFile, updateFile]);

  const handleDeleteExploration = useCallback((id: string) => {
    if (!activeFile) return;
    updateFile({
      ...activeFile,
      explorations: (activeFile.explorations || []).filter(e => e.id !== id),
      highlights: (activeFile.highlights || []).filter(h => h.linkedId !== id),
    });
  }, [activeFile, updateFile]);

  const handleUndoExploration = useCallback((item: ExplorationEntry) => {
    if (!activeFile) return;
    updateFile({ ...activeFile, explorations: [...(activeFile.explorations || []), item] });
  }, [activeFile, updateFile]);

  const handleEditExploration = useCallback((id: string, exploration: string) => {
    if (!activeFile) return;
    updateFile({
      ...activeFile,
      explorations: (activeFile.explorations || []).map(e => e.id === id ? { ...e, exploration } : e),
    });
  }, [activeFile, updateFile]);

  const handleNoteToQuestion = useCallback((id: string) => {
    if (!activeFile) return;
    const note = activeFile.notes.find(n => n.id === id);
    if (!note) return;
    const qNum = (activeFile.questions || []).length + 1;
    const question: QuestionEntry = {
      id: crypto.randomUUID(),
      number: qNum,
      selectedText: note.selectedText,
      imageDataUrl: note.imageDataUrl,
      question: note.note,
      penStrokes: note.penStrokes,
      pageNumber: note.pageNumber,
      timestamp: note.timestamp,
      date: note.date,
    };
    updateFile({
      ...activeFile,
      notes: activeFile.notes.filter(n => n.id !== id),
      questions: [...(activeFile.questions || []), question],
      highlights: (activeFile.highlights || []).map(h =>
        h.linkedId === id ? { ...h, linkedId: question.id, kind: "Q" as const, color: HIGHLIGHT_COLORS.Q, label: `Q${qNum}: ${question.question.slice(0, 60)}` } : h
      ),
    });
  }, [activeFile, updateFile]);

  const handleQuestionToNote = useCallback((id: string) => {
    if (!activeFile) return;
    const q = (activeFile.questions || []).find(q => q.id === id);
    if (!q) return;
    const nNum = activeFile.notes.length + 1;
    const note: NoteEntry = {
      id: crypto.randomUUID(),
      number: nNum,
      selectedText: q.selectedText,
      imageDataUrl: q.imageDataUrl,
      note: q.question,
      penStrokes: q.penStrokes,
      pageNumber: q.pageNumber,
      timestamp: q.timestamp,
      date: q.date,
    };
    updateFile({
      ...activeFile,
      questions: (activeFile.questions || []).filter(qq => qq.id !== id),
      notes: [...activeFile.notes, note],
      highlights: (activeFile.highlights || []).map(h =>
        h.linkedId === id ? { ...h, linkedId: note.id, kind: "N" as const, color: HIGHLIGHT_COLORS.N, label: `N${nNum}: ${note.note.slice(0, 60)}` } : h
      ),
    });
  }, [activeFile, updateFile]);

  const handleNoteToExploration = useCallback((id: string) => {
    if (!activeFile) return;
    const note = activeFile.notes.find(n => n.id === id);
    if (!note) return;
    const eNum = (activeFile.explorations || []).length + 1;
    const exploration: ExplorationEntry = {
      id: crypto.randomUUID(), number: eNum, selectedText: note.selectedText,
      imageDataUrl: note.imageDataUrl, exploration: note.note, penStrokes: note.penStrokes,
      pageNumber: note.pageNumber, timestamp: note.timestamp, date: note.date,
    };
    updateFile({
      ...activeFile,
      notes: activeFile.notes.filter(n => n.id !== id),
      explorations: [...(activeFile.explorations || []), exploration],
      highlights: (activeFile.highlights || []).map(h =>
        h.linkedId === id ? { ...h, linkedId: exploration.id, kind: "E" as const, color: HIGHLIGHT_COLORS.E, label: `E${eNum}: ${exploration.exploration.slice(0, 60)}` } : h
      ),
    });
  }, [activeFile, updateFile]);

  const handleQuestionToExploration = useCallback((id: string) => {
    if (!activeFile) return;
    const q = (activeFile.questions || []).find(q => q.id === id);
    if (!q) return;
    const eNum = (activeFile.explorations || []).length + 1;
    const exploration: ExplorationEntry = {
      id: crypto.randomUUID(), number: eNum, selectedText: q.selectedText,
      imageDataUrl: q.imageDataUrl, exploration: q.question, penStrokes: q.penStrokes,
      pageNumber: q.pageNumber, timestamp: q.timestamp, date: q.date,
    };
    updateFile({
      ...activeFile,
      questions: (activeFile.questions || []).filter(qq => qq.id !== id),
      explorations: [...(activeFile.explorations || []), exploration],
      highlights: (activeFile.highlights || []).map(h =>
        h.linkedId === id ? { ...h, linkedId: exploration.id, kind: "E" as const, color: HIGHLIGHT_COLORS.E, label: `E${eNum}: ${exploration.exploration.slice(0, 60)}` } : h
      ),
    });
  }, [activeFile, updateFile]);

  const handleExplorationToNote = useCallback((id: string) => {
    if (!activeFile) return;
    const e = (activeFile.explorations || []).find(e => e.id === id);
    if (!e) return;
    const nNum = activeFile.notes.length + 1;
    const note: NoteEntry = {
      id: crypto.randomUUID(), number: nNum, selectedText: e.selectedText,
      imageDataUrl: e.imageDataUrl, note: e.exploration, penStrokes: e.penStrokes,
      pageNumber: e.pageNumber, timestamp: e.timestamp, date: e.date,
    };
    updateFile({
      ...activeFile,
      explorations: (activeFile.explorations || []).filter(ee => ee.id !== id),
      notes: [...activeFile.notes, note],
      highlights: (activeFile.highlights || []).map(h =>
        h.linkedId === id ? { ...h, linkedId: note.id, kind: "N" as const, color: HIGHLIGHT_COLORS.N, label: `N${nNum}: ${note.note.slice(0, 60)}` } : h
      ),
    });
  }, [activeFile, updateFile]);

  const handleExplorationToQuestion = useCallback((id: string) => {
    if (!activeFile) return;
    const e = (activeFile.explorations || []).find(e => e.id === id);
    if (!e) return;
    const qNum = (activeFile.questions || []).length + 1;
    const question: QuestionEntry = {
      id: crypto.randomUUID(), number: qNum, selectedText: e.selectedText,
      imageDataUrl: e.imageDataUrl, question: e.exploration, penStrokes: e.penStrokes,
      pageNumber: e.pageNumber, timestamp: e.timestamp, date: e.date,
    };
    updateFile({
      ...activeFile,
      explorations: (activeFile.explorations || []).filter(ee => ee.id !== id),
      questions: [...(activeFile.questions || []), question],
      highlights: (activeFile.highlights || []).map(h =>
        h.linkedId === id ? { ...h, linkedId: question.id, kind: "Q" as const, color: HIGHLIGHT_COLORS.Q, label: `Q${qNum}: ${question.question.slice(0, 60)}` } : h
      ),
    });
  }, [activeFile, updateFile]);

  // Bookmark handlers
  const handleAddBookmark = useCallback((page: number, label: string) => {
    if (!activeFile) return;
    const bm: Bookmark = {
      id: crypto.randomUUID(),
      page,
      label: label || `Page ${page}`,
      createdAt: Date.now(),
    };
    updateFile({ ...activeFile, bookmarks: [...(activeFile.bookmarks || []), bm] });
  }, [activeFile, updateFile]);

  const handleDeleteBookmark = useCallback((id: string) => {
    if (!activeFile) return;
    updateFile({ ...activeFile, bookmarks: (activeFile.bookmarks || []).filter(b => b.id !== id) });
  }, [activeFile, updateFile]);

  const handleJumpToPage = useCallback((page: number) => {
    scrollToPageRef.current?.(page);
  }, []);

  const handleJumpToText = useCallback((page: number, text: string) => {
    highlightTextRef.current?.(page, text);
  }, []);

  // Save spot on browser unload / tab close
  useEffect(() => {
    const save = () => {
      if (activeFileRef.current) {
        // Flush latest scroll position (may not have been saved yet due to debounce)
        if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
        const pos = latestPositionRef.current;
        if (pos.page > 0) {
          activeFileRef.current.lastPage = pos.page;
          activeFileRef.current.lastScrollFraction = pos.fraction;
        }
        activeFileRef.current.updatedAt = Date.now();
        saveReadingFile(activeFileRef.current);
      }
    };
    window.addEventListener("beforeunload", save);
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") save();
    });
    return () => {
      window.removeEventListener("beforeunload", save);
      save(); // also save when component unmounts
    };
  }, []);

  // Library view
  if (!activeFile || !fileData) {
    return (
      <div className="flex-1 overflow-y-auto px-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm text-[#555]">Loading file…</span>
          </div>
        ) : (
          <FileLibrary files={files} onOpen={openFile} onFilesChanged={reload} />
        )}
      </div>
    );
  }

  // Reader view
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Reader toolbar */}
      <div className="flex items-center gap-2 py-2 border-b border-[#1e1e1e] flex-shrink-0 px-4">
        <button onClick={closeFile}
          className="px-2 py-1 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#888] hover:text-white transition-colors">
          ← Library
        </button>
        {toc.length > 0 && (
          <button onClick={() => setShowToc(v => !v)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showToc
                ? "bg-[#e6a017] text-black"
                : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white"
            }`}
          >
            Table of Contents
          </button>
        )}
        <span className="text-sm text-[#ccc] truncate flex-1">{activeFile.title}</span>
        <button onClick={() => setShowCitation(true)}
          className="px-2 py-1 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#888] hover:text-white transition-colors"
          title="Citation info"
        >
          Cite
        </button>
        <button onClick={() => setShowHistory(true)}
          className="px-2 py-1 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#5a8a5a] hover:text-[#8dcc8d] transition-colors"
          title="Reading history"
        >
          History
        </button>
        {/* Countdown timer */}
        {editingTimer ? (
          <form onSubmit={e => { e.preventDefault(); startTimerFromInput(); }} className="flex items-center gap-1">
            <input
              autoFocus
              value={timerInput}
              onChange={e => setTimerInput(e.target.value)}
              placeholder="m or m:ss"
              className="w-16 px-1 py-0.5 text-xs bg-[#111] border border-[#444] rounded text-white font-mono text-center"
              onBlur={() => { if (!timerInput.trim()) setEditingTimer(false); }}
              onKeyDown={e => { if (e.key === "Escape") { setEditingTimer(false); setTimerInput(""); } }}
            />
            <button type="submit" className="text-xs text-[#7173e6] hover:text-white">Go</button>
          </form>
        ) : timerDuration > 0 ? (
          <span className="flex items-center gap-1">
            <span
              className={`text-xs font-mono tabular-nums cursor-pointer ${
                timerExpired ? "text-[#cc3333] animate-pulse" : timerRemaining <= 30 ? "text-[#cc6633]" : "text-[#e6a017]"
              }`}
              title="Click to set new timer"
              onClick={() => { setTimerRunning(false); setTimerDuration(0); setTimerRemaining(0); setTimerExpired(false); setEditingTimer(true); }}
            >
              {timerExpired ? "0:00" : formatTimer(timerRemaining)}
            </span>
            {!timerExpired && (
              <button
                onClick={() => setTimerRunning(r => !r)}
                className="text-[10px] text-[#888] hover:text-white"
                title={timerRunning ? "Pause" : "Resume"}
              >
                {timerRunning ? "⏸" : "▶"}
              </button>
            )}
            <button
              onClick={() => { setTimerRunning(false); setTimerDuration(0); setTimerRemaining(0); setTimerExpired(false); }}
              className="text-[10px] text-[#888] hover:text-white"
              title="Clear timer"
            >✕</button>
          </span>
        ) : (
          <button
            onClick={() => setEditingTimer(true)}
            className="text-xs text-[#888] hover:text-[#e6a017] transition-colors font-mono"
            title="Set a countdown timer"
          >
            ⏱ Timer
          </button>
        )}
        <span className="text-[10px] text-[#444]">Drag to select</span>
        <button onClick={toggleSidePanel}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            activeFile.sidePanelOpen
              ? "bg-[#7173e6] text-white"
              : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white"
          }`}
        >
          {activeFile.sidePanelOpen ? "Hide Panel" : "Show Panel"}
        </button>
      </div>

      {/* Main content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* TOC sidebar */}
        {showToc && (
          <>
            <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
              <TocPanel
                toc={toc}
                bookmarks={activeFile.bookmarks || []}
                currentPage={activeFile.lastPage}
                onJump={handleJumpToPage}
                onAddBookmark={handleAddBookmark}
                onDeleteBookmark={handleDeleteBookmark}
              />
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-[#1e1e1e]" />
          </>
        )}

        {/* Document viewer */}
        <ResizablePanel defaultSize={activeFile.sidePanelOpen ? (showToc ? 52 : 70) : (showToc ? 82 : 100)} minSize={30}>
          <div ref={viewerContainerRef} className="relative h-full overflow-hidden" {...overlay.overlayProps}>
            {activeFile.fileType === "pdf" ? (
              <PdfViewerWrapper
                fileData={fileData}
                lastPage={activeFile.lastPage}
                lastScrollFraction={activeFile.lastScrollFraction ?? 0}
                onPageChange={handlePageChange}
                onTocLoaded={setToc}
                onTotalPages={setTotalPages}
                scrollToPageRef={scrollToPageRef}
                highlightTextRef={highlightTextRef}
                highlights={activeFile.highlights || []}
                onDeleteHighlight={(hlId) => {
                  if (!activeFile) return;
                  updateFile({
                    ...activeFile,
                    highlights: (activeFile.highlights || []).filter(h => h.id !== hlId),
                  });
                }}
                hlResolveLabel={(hl) => {
                  if (!activeFile) return hl.label;
                  if (hl.kind === "N") {
                    const note = activeFile.notes.find(n => n.id === hl.linkedId);
                    return note ? `N${note.number}: ${note.note}` : hl.label;
                  }
                  if (hl.kind === "Q") {
                    const q = (activeFile.questions || []).find(q => q.id === hl.linkedId);
                    return q ? `Q${q.number}: ${q.question}` : hl.label;
                  }
                  if (hl.kind === "E") {
                    const e = (activeFile.explorations || []).find(e => e.id === hl.linkedId);
                    return e ? `E${e.number}: ${e.exploration}` : hl.label;
                  }
                  return hl.label;
                }}
              />
            ) : (
              <EpubViewer
                fileData={fileData}
                lastPage={activeFile.lastPage}
                onPageChange={handlePageChange}
                onTextSelected={() => {}}
              />
            )}
            {overlay.overlayUI}
          </div>
        </ResizablePanel>

        {/* Side panel */}
        {activeFile.sidePanelOpen && (
          <>
            <ResizableHandle withHandle className="bg-[#1e1e1e]" />
            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <div className="h-full bg-[#0d0d0d] border-l border-[#1e1e1e]">
                <SidePanel
                  textExtracts={activeFile.textExtracts}
                  notes={activeFile.notes}
                  questions={activeFile.questions || []}
                  explorations={activeFile.explorations || []}
                  onDeleteExtract={handleDeleteExtract}
                  onDeleteNote={handleDeleteNote}
                  onDeleteQuestion={handleDeleteQuestion}
                  onDeleteExploration={handleDeleteExploration}
                  onUndoExtract={handleUndoExtract}
                  onUndoNote={handleUndoNote}
                  onUndoQuestion={handleUndoQuestion}
                  onUndoExploration={handleUndoExploration}
                  onJumpToText={handleJumpToText}
                  onEditNote={handleEditNote}
                  onEditQuestion={handleEditQuestion}
                  onEditExploration={handleEditExploration}
                  onNoteToQuestion={handleNoteToQuestion}
                  onNoteToExploration={handleNoteToExploration}
                  onQuestionToNote={handleQuestionToNote}
                  onQuestionToExploration={handleQuestionToExploration}
                  onExplorationToNote={handleExplorationToNote}
                  onExplorationToQuestion={handleExplorationToQuestion}
                />
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Note editor modal */}
      {noteEditorText !== null && (
        <NoteEditor
          selectedText={noteEditorText}
          onSave={handleSaveNote}
          onCancel={() => { setNoteEditorText(null); setNoteEditorImageDataUrl(undefined); }}
        />
      )}

      {/* Reading history modal */}
      {showHistory && activeFile && (
        <ReadingHistoryModal
          file={activeFile}
          totalPages={totalPages}
          onJumpToPage={handleJumpToPage}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Citation info modal */}
      {showCitation && activeFile && (
        <CitationModal
          file={activeFile}
          fileData={activeFile.fileType === "pdf" ? fileData : null}
          onSave={(updated) => {
            setActiveFile(updated);
            saveReadingFile(updated);
            reload();
          }}
          onClose={() => setShowCitation(false)}
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

const SMALL_WORDS = new Set(["a","an","the","and","but","or","nor","for","in","on","at","to","of","by","with","from","as","is"]);
function toTitleCase(s: string): string {
  // If it's already mixed case (not ALL CAPS), leave it alone
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (i === 0 || !SMALL_WORDS.has(w)) {
        // Handle roman numerals
        if (/^[ivxlcdm]+$/.test(w) && w.length <= 5) return w.toUpperCase();
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
      return w;
    })
    .join(" ");
}

// ── Page number input — uses local string state so you can freely type/delete ──

function PageInput({ currentPage, totalPages, onGo }: { currentPage: number; totalPages: number; onGo: (p: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const p = parseInt(draft, 10);
    if (p >= 1 && p <= totalPages) onGo(p);
    setEditing(false);
  };

  return (
    <span className="text-xs text-[#666] flex items-center gap-1">Page
      <input
        type="text"
        inputMode="numeric"
        value={editing ? draft : String(currentPage)}
        onFocus={e => { setEditing(true); setDraft(String(currentPage)); e.target.select(); }}
        onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-10 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 py-0.5 text-xs text-white text-center focus:outline-none focus:border-[#7173e6] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      / {totalPages}
    </span>
  );
}

// ── PdfViewer wrapper that hooks up scrollToPage ref ──────────────────────

function PdfViewerWrapper({
  fileData, lastPage, lastScrollFraction, onPageChange, onTocLoaded, onTotalPages, scrollToPageRef, highlightTextRef,
  highlights, onDeleteHighlight, hlResolveLabel,
}: {
  fileData: ArrayBuffer;
  lastPage: number;
  lastScrollFraction: number;
  onPageChange: (page: number, scrollFraction: number) => void;
  onTocLoaded: (toc: TocEntry[]) => void;
  onTotalPages?: (n: number) => void;
  scrollToPageRef: React.MutableRefObject<((p: number) => void) | null>;
  highlightTextRef: React.MutableRefObject<((page: number, text: string) => void) | null>;
  highlights?: Highlight[];
  onDeleteHighlight?: (id: string) => void;
  hlResolveLabel?: (hl: Highlight) => string;
}) {
  const viewer = PdfViewer({ fileData, lastPage, lastScrollFraction, onPageChange, onTocLoaded });
  scrollToPageRef.current = viewer.scrollToPage;
  highlightTextRef.current = viewer.highlightText;

  // Report totalPages up
  useEffect(() => {
    if (viewer.totalPages > 0 && onTotalPages) onTotalPages(viewer.totalPages);
  }, [viewer.totalPages, onTotalPages]);

  // ── Search state ────────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ctrl+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
        setSearchMatches([]);
        setCurrentMatchIdx(0);
        viewer.clearHighlights();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSearch, viewer.clearHighlights]);

  // Re-highlight after scale changes
  const prevScaleRef = useRef(viewer.scale);
  useEffect(() => {
    if (prevScaleRef.current !== viewer.scale && searchMatches.length > 0 && searchQuery) {
      const match = searchMatches[currentMatchIdx];
      if (match) viewer.highlightOnPage(match.page, searchQuery, match.matchIndexOnPage);
    }
    prevScaleRef.current = viewer.scale;
  }, [viewer.scale, searchMatches, currentMatchIdx, searchQuery, viewer.highlightOnPage]);

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchMatches([]);
      setCurrentMatchIdx(0);
      viewer.clearHighlights();
      return;
    }
    setSearching(true);
    const matches = await viewer.searchText(query);
    setSearchMatches(matches);
    setCurrentMatchIdx(0);
    setSearching(false);
    if (matches.length > 0) {
      viewer.scrollToPage(matches[0].page);
      viewer.highlightOnPage(matches[0].page, query, matches[0].matchIndexOnPage);
    } else {
      viewer.clearHighlights();
    }
  }, [viewer]);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => doSearch(value), 350);
  }, [doSearch]);

  const navigateMatch = useCallback((delta: number) => {
    if (searchMatches.length === 0) return;
    const newIdx = (currentMatchIdx + delta + searchMatches.length) % searchMatches.length;
    setCurrentMatchIdx(newIdx);
    const match = searchMatches[newIdx];
    viewer.scrollToPage(match.page);
    viewer.highlightOnPage(match.page, searchQuery, match.matchIndexOnPage);
  }, [searchMatches, currentMatchIdx, searchQuery, viewer]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery("");
    setSearchMatches([]);
    setCurrentMatchIdx(0);
    viewer.clearHighlights();
  }, [viewer.clearHighlights]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#1e1e1e] flex-shrink-0 sticky top-0 z-10 bg-[#0d0d0d]">
        <PageInput currentPage={viewer.currentPage} totalPages={viewer.totalPages} onGo={viewer.scrollToPage} />
        <button
          onClick={() => {
            if (showSearch) closeSearch();
            else { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 0); }
          }}
          className={`px-2 py-0.5 text-xs rounded transition-colors ${
            showSearch
              ? "bg-[#e6a017] text-black"
              : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white"
          }`}
          title="Search (Ctrl+F)"
        >
          Search
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => viewer.setScale(s => Math.max(0.5, s - 0.2))}
            className="px-2 py-0.5 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#888] hover:text-white">−</button>
          <span className="text-xs text-[#555] w-12 text-center">{Math.round(viewer.scale * 100)}%</span>
          <button onClick={() => viewer.setScale(s => Math.min(3, s + 0.2))}
            className="px-2 py-0.5 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#888] hover:text-white">+</button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e1e1e] bg-[#111] flex-shrink-0">
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => handleSearchInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") navigateMatch(e.shiftKey ? -1 : 1);
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Search in document…"
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#7173e6] placeholder-[#555]"
          />
          {searching ? (
            <span className="text-[10px] text-[#555]">Searching…</span>
          ) : searchQuery ? (
            <span className="text-[10px] text-[#888] tabular-nums whitespace-nowrap">
              {searchMatches.length > 0
                ? `${currentMatchIdx + 1} / ${searchMatches.length}`
                : "No matches"}
            </span>
          ) : null}
          <button onClick={() => navigateMatch(-1)} disabled={searchMatches.length === 0}
            className="px-1.5 py-0.5 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#888] hover:text-white disabled:opacity-30 transition-colors">▲</button>
          <button onClick={() => navigateMatch(1)} disabled={searchMatches.length === 0}
            className="px-1.5 py-0.5 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#888] hover:text-white disabled:opacity-30 transition-colors">▼</button>
          <button onClick={closeSearch}
            className="text-xs text-[#555] hover:text-white transition-colors">✕</button>
        </div>
      )}

      {viewer.viewerUI}

      {/* Persistent highlight overlays — injected into page wrappers via effect */}
      <HighlightOverlays
        containerRef={viewer.containerRef}
        highlights={highlights || []}
        scale={viewer.scale}
        onDelete={onDeleteHighlight}
        resolveLabel={hlResolveLabel}
      />
    </div>
  );
}

// ── Highlight overlays rendered on PDF pages ────────────────────────────

function HighlightOverlays({ containerRef, highlights, scale, onDelete, resolveLabel }: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  highlights: Highlight[];
  scale: number;
  onDelete?: (id: string) => void;
  resolveLabel?: (hl: Highlight) => string;
}) {
  // Use fixed (viewport) coordinates so tooltip renders correctly regardless of scroll container nesting
  const [tooltip, setTooltip] = useState<{ fixedX: number; fixedY: number; label: string; id: string } | null>(null);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const resolveLabelRef = useRef(resolveLabel);
  resolveLabelRef.current = resolveLabel;
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

  // Inject highlight divs into page wrappers
  useEffect(() => {
    const container = containerRef.current;
    if (!container || highlights.length === 0) return;

    function injectHighlights() {
      const cont = containerRef.current;
      if (!cont) return;
      // Remove old ones first
      cont.querySelectorAll(".pdf-hl-overlay").forEach(el => el.remove());

      for (const hl of highlights) {
        const pageEl = cont.querySelector(`.pdf-page-wrapper[data-page="${hl.page}"]`) as HTMLElement | null;
        if (!pageEl) continue;
        // Skip if already injected
        if (pageEl.querySelector(`[data-hl-id="${hl.id}"]`)) continue;

        const div = document.createElement("div");
        div.className = "pdf-hl-overlay";
        div.dataset.hlId = hl.id;
        Object.assign(div.style, {
          position: "absolute",
          left: `${hl.xPct * 100}%`,
          top: `${hl.yPct * 100}%`,
          width: `${hl.wPct * 100}%`,
          height: `${hl.hPct * 100}%`,
          background: hl.color + "30",
          border: `1.5px solid ${hl.color}55`,
          borderRadius: "2px",
          pointerEvents: "auto",
          cursor: "pointer",
          zIndex: "5",
          transition: "background 150ms, border-color 150ms",
        });

        const hlId = hl.id;
        const color = hl.color;

        div.addEventListener("mouseenter", () => {
          div.style.background = color + "50";
          div.style.borderColor = color + "aa";
          const hlRect = div.getBoundingClientRect();
          // Resolve label at hover time via refs so edits are reflected immediately
          const currentHl = highlightsRef.current.find(h => h.id === hlId);
          const resolve = resolveLabelRef.current;
          const label = currentHl && resolve ? resolve(currentHl) : (currentHl?.label ?? hl.label);
          setTooltip({
            fixedX: hlRect.right + 8,
            fixedY: hlRect.top,
            label,
            id: hlId,
          });
        });
        div.addEventListener("mouseleave", () => {
          div.style.background = color + "30";
          div.style.borderColor = color + "55";
          setTooltip(null);
        });
        div.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          onDeleteRef.current?.(hlId);
        });

        pageEl.appendChild(div);
      }
    }

    // Inject immediately
    injectHighlights();

    // Also re-inject when DOM changes (e.g., after zoom rebuilds page wrappers)
    const observer = new MutationObserver(() => {
      // Check if highlights are missing
      const cont = containerRef.current;
      if (!cont) return;
      const existing = cont.querySelectorAll(".pdf-hl-overlay").length;
      if (existing < highlights.length) {
        injectHighlights();
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      container.querySelectorAll(".pdf-hl-overlay").forEach(el => el.remove());
    };
  }, [containerRef, highlights, scale]);

  if (!tooltip) return null;
  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        left: tooltip.fixedX,
        top: tooltip.fixedY,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div style={{
        background: "#1a1a2a",
        border: "1px solid #3a3a5a",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        lineHeight: 1.5,
        color: "#ddd",
        maxWidth: 320,
        minWidth: 120,
        whiteSpace: "pre-wrap",
        boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
      }}>
        {tooltip.label}
      </div>
    </div>,
    document.body,
  );
}

// ── TOC + Bookmarks panel ────────────────────────────────────────────────

function TocPanel({
  toc, bookmarks, currentPage, onJump, onAddBookmark, onDeleteBookmark,
}: {
  toc: TocEntry[];
  bookmarks: Bookmark[];
  currentPage: number;
  onJump: (page: number) => void;
  onAddBookmark: (page: number, label: string) => void;
  onDeleteBookmark: (id: string) => void;
}) {
  const [tab, setTab] = useState<"toc" | "bm">("toc");
  const [bmLabel, setBmLabel] = useState("");

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] border-r border-[#1e1e1e]">
      {/* Tabs */}
      <div className="flex border-b border-[#1e1e1e] flex-shrink-0">
        <button
          onClick={() => setTab("toc")}
          className={`flex-1 text-xs py-2 font-medium transition-colors ${
            tab === "toc" ? "text-[#e6a017] border-b-2 border-[#e6a017]" : "text-[#555] hover:text-[#888]"
          }`}
        >
          Contents
        </button>
        <button
          onClick={() => setTab("bm")}
          className={`flex-1 text-xs py-2 font-medium transition-colors ${
            tab === "bm" ? "text-[#e06060] border-b-2 border-[#e06060]" : "text-[#555] hover:text-[#888]"
          }`}
        >
          Bookmarks ({bookmarks.length})
        </button>
      </div>

      {tab === "toc" ? (
        <div className="flex-1 overflow-y-auto py-1">
          {toc.map((entry, i) => {
            const isTop = entry.depth === 0;
            return (
              <button
                key={i}
                onClick={() => onJump(entry.pageIndex + 1)}
                className={`w-full text-left px-3 hover:bg-[#1a1a1a] transition-colors flex items-baseline gap-2 ${
                  isTop ? "py-2 border-b border-[#1a1a1a]" : "py-1.5"
                }`}
                style={{ paddingLeft: `${12 + entry.depth * 14}px` }}
              >
                <span className={`flex-1 leading-snug ${
                  isTop ? "text-xs font-medium text-[#ccc]" : "text-[11px] text-[#888]"
                }`}>
                  {toTitleCase(entry.title)}
                </span>
                <span className="text-[10px] text-[#555] flex-shrink-0 tabular-nums">{entry.pageIndex + 1}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-2 space-y-1">
          {/* Add bookmark */}
          <div className="flex gap-1 px-2 pb-2 border-b border-[#1e1e1e]">
            <input
              value={bmLabel}
              onChange={e => setBmLabel(e.target.value)}
              placeholder={`Bookmark p.${currentPage}…`}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  onAddBookmark(currentPage, bmLabel.trim() || `Page ${currentPage}`);
                  setBmLabel("");
                }
              }}
              className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#e06060] min-w-0"
            />
            <button
              onClick={() => {
                onAddBookmark(currentPage, bmLabel.trim() || `Page ${currentPage}`);
                setBmLabel("");
              }}
              className="px-2 py-1 text-xs bg-[#e06060] hover:bg-[#c04040] text-white rounded flex-shrink-0"
            >
              +
            </button>
          </div>

          {bookmarks.length === 0 ? (
            <div className="text-xs text-[#444] text-center py-6">No bookmarks yet</div>
          ) : (
            bookmarks
              .sort((a, b) => a.page - b.page)
              .map(bm => (
                <div
                  key={bm.id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#1a1a1a] transition-colors group cursor-pointer"
                  onClick={() => onJump(bm.page)}
                >
                  <span className="text-[10px] text-[#e06060] font-mono flex-shrink-0">p.{bm.page}</span>
                  <span className="text-xs text-[#999] flex-1 truncate">{bm.label}</span>
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteBookmark(bm.id); }}
                    className="text-[10px] text-[#444] hover:text-[#e06060] opacity-0 group-hover:opacity-100 flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Citation Info Modal ───────────────────────────────────────────────────

const CITATION_FIELDS: { key: keyof CitationMeta; label: string; placeholder: string }[] = [
  { key: "subtitle", label: "Subtitle", placeholder: "Subtitle or secondary title" },
  { key: "editors", label: "Editor(s)", placeholder: "Editor names" },
  { key: "publisher", label: "Publisher", placeholder: "Publisher name" },
  { key: "year", label: "Year", placeholder: "Publication year" },
  { key: "edition", label: "Edition", placeholder: "e.g. 3rd" },
  { key: "journal", label: "Journal", placeholder: "Journal / periodical name" },
  { key: "conference", label: "Conference", placeholder: "Conference name" },
  { key: "volume", label: "Volume", placeholder: "Volume number" },
  { key: "issue", label: "Issue", placeholder: "Issue number" },
  { key: "pages", label: "Pages", placeholder: "e.g. 12-34" },
  { key: "doi", label: "DOI", placeholder: "e.g. 10.1000/xyz123" },
  { key: "isbn", label: "ISBN", placeholder: "ISBN" },
  { key: "issn", label: "ISSN", placeholder: "ISSN" },
  { key: "url", label: "URL", placeholder: "https://…" },
  { key: "institution", label: "Institution", placeholder: "University / institution" },
  { key: "accessDate", label: "Access Date", placeholder: "Date accessed (for web)" },
];

function CitationModal({ file, fileData, onSave, onClose }: {
  file: ReadingFile;
  fileData: ArrayBuffer | null;
  onSave: (updated: ReadingFile) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(file.title);
  const [author, setAuthor] = useState(file.author);
  const [meta, setMeta] = useState<CitationMeta>(file.citation ?? {});
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "cite">("edit");
  const [extracting, setExtracting] = useState(false);

  const handleExtractFromPdf = async () => {
    if (!fileData) return;
    setExtracting(true);
    try {
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(fileData) }).promise;
      const metaResult = await doc.getMetadata();
      const info = metaResult?.info as Record<string, unknown> | undefined;
      if (info) {
        if (typeof info.Title === "string" && info.Title.trim() && !title) setTitle(info.Title.trim());
        if (typeof info.Author === "string" && info.Author.trim() && !author) setAuthor(info.Author.trim());
        if (typeof info.Subject === "string" && info.Subject.trim() && !meta.abstract) {
          setMeta(prev => ({ ...prev, abstract: info.Subject as string }));
        }
      }
      // Scan first 5 pages for DOI / ISBN / ISSN / year
      const maxPages = Math.min(doc.numPages, 5);
      let scannedText = "";
      for (let i = 1; i <= maxPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        scannedText += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
      }
      const updates: Partial<CitationMeta> = {};
      const doiMatch = scannedText.match(/\b(10\.\d{4,}\/[^\s,;]+)/);
      if (doiMatch && !meta.doi) updates.doi = doiMatch[1].replace(/[.)]+$/, "");
      const isbnMatch = scannedText.match(/ISBN[\s:-]*([\d-]{10,})/i);
      if (isbnMatch && !meta.isbn) updates.isbn = isbnMatch[1];
      const issnMatch = scannedText.match(/ISSN[\s:-]*([\d-]{7,})/i);
      if (issnMatch && !meta.issn) updates.issn = issnMatch[1];
      if (Object.keys(updates).length > 0) setMeta(prev => ({ ...prev, ...updates }));
      doc.destroy();
    } catch { /* best effort */ }
    setExtracting(false);
  };

  const updateMeta = (key: keyof CitationMeta, val: string) => {
    setMeta(prev => ({ ...prev, [key]: val || undefined }));
  };

  const handleSave = () => {
    const cleaned: CitationMeta = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v && typeof v === "string" && v.trim()) {
        (cleaned as Record<string, string>)[k] = v.trim();
      }
    }
    onSave({
      ...file,
      title: title.trim() || file.title,
      author: author.trim(),
      citation: Object.keys(cleaned).length > 0 ? cleaned : undefined,
      updatedAt: Date.now(),
    });
    onClose();
  };

  const currentFile: ReadingFile = { ...file, title, author, citation: meta };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text.replace(/\*/g, ""));
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const inputCls = "w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-[#7173e6] placeholder-[#444]";
  const labelCls = "text-[10px] text-[#555] font-medium uppercase tracking-wider mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#111] border border-[#2a2a2a] rounded-xl w-[520px] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-3">
            <h2 className="text-white font-semibold text-base">Citation Info</h2>
            {fileData && (
              <button
                onClick={handleExtractFromPdf}
                disabled={extracting}
                className="px-2 py-0.5 text-[10px] bg-[#1a1a2a] border border-[#3a3a7a] rounded text-[#9a9cf8] hover:text-white transition-colors disabled:opacity-40"
              >
                {extracting ? "Scanning…" : "Re-scan PDF"}
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-white text-lg">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1e1e1e]">
          <button
            onClick={() => setTab("edit")}
            className={`flex-1 text-xs py-2.5 font-medium transition-colors ${
              tab === "edit" ? "text-[#7173e6] border-b-2 border-[#7173e6]" : "text-[#555] hover:text-[#888]"
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setTab("cite")}
            className={`flex-1 text-xs py-2.5 font-medium transition-colors ${
              tab === "cite" ? "text-[#7173e6] border-b-2 border-[#7173e6]" : "text-[#555] hover:text-[#888]"
            }`}
          >
            Formatted Citations
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "edit" ? (
            <div className="space-y-3">
              <div>
                <div className={labelCls}>Title</div>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className={inputCls} />
              </div>
              <div>
                <div className={labelCls}>Author(s)</div>
                <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Last, First; Last, First" className={inputCls} />
              </div>

              <div className="border-t border-[#1e1e1e] pt-3 mt-3" />

              <div className="grid grid-cols-2 gap-3">
                {CITATION_FIELDS.map(f => (
                  <div key={f.key} className={f.key === "url" ? "col-span-2" : ""}>
                    <div className={labelCls}>{f.label}</div>
                    <input
                      value={meta[f.key] ?? ""}
                      onChange={e => updateMeta(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className={inputCls}
                    />
                  </div>
                ))}
                <div className="col-span-2">
                  <div className={labelCls}>Abstract</div>
                  <textarea
                    value={meta.abstract ?? ""}
                    onChange={e => updateMeta("abstract", e.target.value)}
                    placeholder="Abstract or summary…"
                    rows={3}
                    className={`${inputCls} resize-y`}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {([
                ["APA", formatAPA(currentFile)],
                ["MLA", formatMLA(currentFile)],
                ["Chicago", formatChicago(currentFile)],
              ] as [string, string][]).map(([label, text]) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-[#555] font-medium uppercase tracking-wider">{label}</span>
                    <button
                      onClick={() => copyToClipboard(text, label)}
                      className="text-[10px] text-[#7173e6] hover:text-white transition-colors"
                    >
                      {copied === label ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 text-xs text-[#ccc] leading-relaxed select-all whitespace-pre-wrap">
                    {text}
                  </div>
                </div>
              ))}

              <div className="border-t border-[#1e1e1e] pt-3">
                <div className="text-[10px] text-[#555] font-medium uppercase tracking-wider mb-2">All Fields</div>
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 space-y-1">
                  {[
                    ["Title", title],
                    ["Author", author],
                    ...CITATION_FIELDS.map(f => [f.label, meta[f.key] ?? ""] as [string, string]),
                  ].filter(([, v]) => v).map(([label, val]) => (
                    <div key={label} className="flex gap-2 text-xs">
                      <span className="text-[#555] w-20 flex-shrink-0">{label}:</span>
                      <span className="text-[#ccc]">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-[#1e1e1e]">
          <button onClick={onClose}
            className="px-3 py-1.5 bg-[#1a1a1a] border border-[#333] text-[#aaa] hover:text-white text-sm rounded transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-4 py-1.5 bg-[#7173e6] hover:bg-[#5a5cc7] text-white text-sm rounded font-medium transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
