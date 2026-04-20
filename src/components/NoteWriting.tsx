import { useState, useRef, useCallback, useEffect } from "react";
import { useLS } from "@/lib/storage";

/* ────────────────────────────────────────────────────────────── */
/*  Types                                                         */
/* ────────────────────────────────────────────────────────────── */

interface Point {
  x: number;
  y: number;
  pressure: number;
}

interface Stroke {
  points: Point[];
  color: string;
  thickness: number;
  tool: "pen" | "highlighter";
}

type PaperType = "blank" | "grid" | "college-ruled";

interface NotePage {
  id: string;
  name: string;
  paper: PaperType;
  strokes: Stroke[];
  canvasHeight: number;
  createdAt: number;
}

interface NoteCategory {
  id: string;
  name: string;
  color: string;
  pages: NotePage[];
}

/* ────────────────────────────────────────────────────────────── */
/*  Constants                                                     */
/* ────────────────────────────────────────────────────────────── */

const COLORS = [
  "#ffffff", "#e06060", "#e0a040", "#e0e040",
  "#5cca5c", "#40a0e0", "#7173e6", "#c060c0",
  "#888888", "#333333",
];

const HIGHLIGHTER_COLORS = [
  "#ffff0066", "#00ff0066", "#ff80ff66", "#00ffff66", "#ff800066",
];

const CATEGORY_COLORS = [
  "#7173e6", "#5cca5c", "#e06060", "#e0a040", "#40a0e0", "#c060c0",
];

const THICKNESS_OPTIONS = [1, 2, 3, 5, 8, 12];

const GRID_SIZE = 25;
const RULE_SPACING = 32;
const MARGIN_X = 80;

/* ────────────────────────────────────────────────────────────── */
/*  Helpers                                                       */
/* ────────────────────────────────────────────────────────────── */

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DEFAULT_CANVAS_HEIGHT = 2000;

function makeDefaultPage(paper: PaperType = "blank"): NotePage {
  return { id: uid(), name: "Untitled Section", paper, strokes: [], canvasHeight: DEFAULT_CANVAS_HEIGHT, createdAt: Date.now() };
}

function makeDefaultCategory(): NoteCategory {
  return {
    id: uid(),
    name: "New Notebook",
    color: CATEGORY_COLORS[0],
    pages: [makeDefaultPage()],
  };
}

/* ────────────────────────────────────────────────────────────── */
/*  Draw paper backgrounds                                        */
/* ────────────────────────────────────────────────────────────── */

function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number, paper: PaperType) {
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, w, h);

  if (paper === "grid") {
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 0.5;
    for (let x = GRID_SIZE; x < w; x += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = GRID_SIZE; y < h; y += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  if (paper === "college-ruled") {
    // margin line
    ctx.strokeStyle = "#3a2020";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(MARGIN_X, 0); ctx.lineTo(MARGIN_X, h); ctx.stroke();
    // horizontal rules
    ctx.strokeStyle = "#1a3a5a";
    ctx.lineWidth = 0.5;
    for (let y = RULE_SPACING; y < h; y += RULE_SPACING) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }
}

/* ────────────────────────────────────────────────────────────── */
/*  Draw strokes                                                  */
/* ────────────────────────────────────────────────────────────── */

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length < 2) return;
  const isHL = stroke.tool === "highlighter";

  ctx.save();
  if (isHL) ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;

  const pts = stroke.points;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[i - 1];
    const pressure = Math.max(0.1, p.pressure);
    ctx.lineWidth = stroke.thickness * (isHL ? 3 : 1) * pressure;
    const mx = (prev.x + p.x) / 2;
    const my = (prev.y + p.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  ctx.stroke();
  ctx.restore();
}

function redraw(ctx: CanvasRenderingContext2D, w: number, h: number, paper: PaperType, strokes: Stroke[]) {
  drawPaper(ctx, w, h, paper);
  for (const s of strokes) drawStroke(ctx, s);
}

/* ────────────────────────────────────────────────────────────── */
/*  Component                                                     */
/* ────────────────────────────────────────────────────────────── */

export default function NoteWriting() {
  /* ── Persisted data ── */
  const [categories, setCategories] = useLS<NoteCategory[]>("lt_nw_categories", [makeDefaultCategory()]);
  const [activeCatId, setActiveCatId] = useLS<string>("lt_nw_active_cat", "");
  const [activePageId, setActivePageId] = useLS<string>("lt_nw_active_page", "");

  /* ── Tool state ── */
  const [tool, setTool] = useState<"pen" | "eraser" | "highlighter">("pen");
  const [penColor, setPenColor] = useState("#ffffff");
  const [hlColor, setHlColor] = useState(HIGHLIGHTER_COLORS[0]);
  const [thickness, setThickness] = useState(3);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ── Canvas refs ── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);
  const undoStack = useRef<Stroke[][]>([]);
  const redoStack = useRef<Stroke[][]>([]);
  const draggingHandle = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const dragAnimFrame = useRef<number | null>(null);
  const dragSpeed = useRef(0);

  /* ── Editing state ── */
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ type: "cat" | "page"; catId: string; pageId?: string } | null>(null);

  /* ── Resolve active category & page ── */
  const activeCat = categories.find(c => c.id === activeCatId) || categories[0];
  const activePage = activeCat?.pages.find(p => p.id === activePageId) || activeCat?.pages[0];

  // Sync IDs when they drift
  useEffect(() => {
    if (activeCat && activeCatId !== activeCat.id) setActiveCatId(activeCat.id);
    if (activePage && activePageId !== activePage.id) setActivePageId(activePage.id);
  }, [activeCat, activePage]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Canvas sizing ── */
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const scrollContainer = scrollRef.current;
    if (!canvas || !scrollContainer || !activePage) return;
    const w = scrollContainer.clientWidth;
    const h = activePage.canvasHeight || DEFAULT_CANVAS_HEIGHT;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    redraw(ctx, w, h, activePage.paper, activePage.strokes);
  }, [activePage]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  /* ── Repaint when page changes ── */
  useEffect(() => {
    resizeCanvas();
  }, [activePage, resizeCanvas]);

  /* ── Mutate helpers ── */
  const updatePage = useCallback((pageId: string, fn: (p: NotePage) => NotePage) => {
    setCategories(cats => cats.map(c => ({
      ...c,
      pages: c.pages.map(p => p.id === pageId ? fn(p) : p),
    })));
  }, [setCategories]);

  const pushUndo = useCallback(() => {
    if (!activePage) return;
    undoStack.current.push([...activePage.strokes]);
    redoStack.current = [];
  }, [activePage]);

  /* ── Pointer handlers (pen + touch + mouse) ── */
  const getCanvasPoint = useCallback((e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!activePage) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;

    // Surface Pen eraser button (buttons === 32) or eraser tool
    const isErasing = tool === "eraser" || e.buttons === 32;
    if (isErasing) {
      pushUndo();
      const pt = getCanvasPoint(e);
      const eraserRadius = thickness * 3;
      updatePage(activePage.id, p => ({
        ...p,
        strokes: p.strokes.filter(s =>
          !s.points.some(sp => Math.hypot(sp.x - pt.x, sp.y - pt.y) < eraserRadius)
        ),
      }));
      return;
    }

    pushUndo();
    const pt = getCanvasPoint(e);
    currentStroke.current = {
      points: [pt],
      color: tool === "highlighter" ? hlColor : penColor,
      thickness,
      tool: tool === "highlighter" ? "highlighter" : "pen",
    };
  }, [activePage, tool, penColor, hlColor, thickness, pushUndo, getCanvasPoint, updatePage]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing.current || !activePage) return;
    const pt = getCanvasPoint(e);

    // Surface Pen eraser button (buttons === 32) or eraser tool
    const isErasing = tool === "eraser" || e.buttons === 32;
    if (isErasing) {
      const eraserRadius = thickness * 3;
      updatePage(activePage.id, p => ({
        ...p,
        strokes: p.strokes.filter(s =>
          !s.points.some(sp => Math.hypot(sp.x - pt.x, sp.y - pt.y) < eraserRadius)
        ),
      }));
      return;
    }

    if (currentStroke.current) {
      currentStroke.current.points.push(pt);
      // live draw
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        const pts = currentStroke.current.points;
        if (pts.length >= 2) {
          const p = pts[pts.length - 1];
          const prev = pts[pts.length - 2];
          ctx.save();
          if (currentStroke.current.tool === "highlighter") ctx.globalCompositeOperation = "lighter";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = currentStroke.current.color;
          const pressure = Math.max(0.1, p.pressure);
          ctx.lineWidth = currentStroke.current.thickness * (currentStroke.current.tool === "highlighter" ? 3 : 1) * pressure;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }, [activePage, tool, thickness, getCanvasPoint, updatePage]);

  const handlePointerUp = useCallback(() => {
    if (!drawing.current || !activePage) return;
    drawing.current = false;
    if (currentStroke.current && currentStroke.current.points.length > 1) {
      const stroke = currentStroke.current;
      updatePage(activePage.id, p => ({ ...p, strokes: [...p.strokes, stroke] }));
    }
    currentStroke.current = null;
  }, [activePage, updatePage]);

  /* ── Undo / Redo ── */
  const undo = useCallback(() => {
    if (!activePage || undoStack.current.length === 0) return;
    redoStack.current.push([...activePage.strokes]);
    const prev = undoStack.current.pop()!;
    updatePage(activePage.id, p => ({ ...p, strokes: prev }));
  }, [activePage, updatePage]);

  const redo = useCallback(() => {
    if (!activePage || redoStack.current.length === 0) return;
    undoStack.current.push([...activePage.strokes]);
    const next = redoStack.current.pop()!;
    updatePage(activePage.id, p => ({ ...p, strokes: next }));
  }, [activePage, updatePage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  /* ── Category / Page CRUD ── */
  const addCategory = () => {
    const cat = makeDefaultCategory();
    cat.color = CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length];
    setCategories(cs => [...cs, cat]);
    setActiveCatId(cat.id);
    setActivePageId(cat.pages[0].id);
  };

  const deleteCategory = (catId: string) => {
    if (categories.length <= 1) return;
    setCategories(cs => cs.filter(c => c.id !== catId));
  };

  const addPage = (catId: string, paper: PaperType = "blank") => {
    const page = makeDefaultPage(paper);
    setCategories(cs => cs.map(c =>
      c.id === catId ? { ...c, pages: [...c.pages, page] } : c
    ));
    setActivePageId(page.id);
  };

  const deletePage = (catId: string, pageId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat || cat.pages.length <= 1) return;
    setCategories(cs => cs.map(c =>
      c.id === catId ? { ...c, pages: c.pages.filter(p => p.id !== pageId) } : c
    ));
  };

  const changePaper = (paper: PaperType) => {
    if (!activePage) return;
    updatePage(activePage.id, p => ({ ...p, paper }));
  };

  const startRename = (type: "cat" | "page", id: string, currentName: string) => {
    if (type === "cat") setEditingCat(id);
    else setEditingPage(id);
    setEditValue(currentName);
  };

  const commitRename = () => {
    if (editingCat) {
      setCategories(cs => cs.map(c => c.id === editingCat ? { ...c, name: editValue || c.name } : c));
      setEditingCat(null);
    }
    if (editingPage) {
      updatePage(editingPage, p => ({ ...p, name: editValue || p.name }));
      setEditingPage(null);
    }
  };

  /* ── Clear page ── */
  const clearPage = () => {
    if (!activePage) return;
    pushUndo();
    updatePage(activePage.id, p => ({ ...p, strokes: [] }));
  };

  /* ── Drag handle to extend canvas ── */
  const EXTEND_RATE = 4; // pixels per frame (~240px/sec at 60fps)
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (!activePage) return;
    e.preventDefault();
    draggingHandle.current = true;

    const growLoop = () => {
      if (!draggingHandle.current) return;
      updatePage(activePage.id, p => ({
        ...p,
        canvasHeight: (p.canvasHeight || DEFAULT_CANVAS_HEIGHT) + EXTEND_RATE,
      }));
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      dragAnimFrame.current = requestAnimationFrame(growLoop);
    };
    dragAnimFrame.current = requestAnimationFrame(growLoop);

    const onUp = () => {
      draggingHandle.current = false;
      if (dragAnimFrame.current) { cancelAnimationFrame(dragAnimFrame.current); dragAnimFrame.current = null; }
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointerup", onUp);
  }, [activePage, updatePage]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Render                                                      */
  /* ──────────────────────────────────────────────────────────── */

  return (
    <div className="flex h-full overflow-hidden text-white">
      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div className="w-56 flex-shrink-0 bg-[#141414] border-r border-[#2a2a2a] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
            <span className="text-xs font-semibold text-[#888] uppercase tracking-widest">Notebooks</span>
            <button onClick={addCategory}
              className="text-[#666] hover:text-white text-lg leading-none" title="New notebook">+</button>
          </div>

          {/* Category list */}
          <div className="flex-1 overflow-y-auto py-1">
            {categories.map(cat => (
              <div key={cat.id}>
                {/* Category header */}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-xs group ${
                    activeCat?.id === cat.id ? "bg-[#1e1e1e]" : "hover:bg-[#1a1a1a]"
                  }`}
                  onClick={() => { setActiveCatId(cat.id); setActivePageId(cat.pages[0]?.id || ""); }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                  {editingCat === cat.id ? (
                    <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                      onBlur={commitRename} onKeyDown={e => e.key === "Enter" && commitRename()}
                      className="bg-[#252525] border border-[#444] rounded px-1 text-xs text-white w-full" />
                  ) : (
                    <span className="truncate flex-1" onDoubleClick={() => startRename("cat", cat.id, cat.name)}>
                      {cat.name}
                    </span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "cat", catId: cat.id }); }}
                    className="text-[#444] hover:text-[#e06060] opacity-0 group-hover:opacity-100 text-xs"
                    title="Delete notebook">×</button>
                </div>

                {/* Pages (shown when category is active) */}
                {activeCat?.id === cat.id && (
                  <div className="ml-4 border-l border-[#2a2a2a]">
                    {cat.pages.map(page => (
                      <div
                        key={page.id}
                        className={`flex items-center gap-1 pl-3 pr-2 py-1 cursor-pointer text-xs group ${
                          activePage?.id === page.id ? "text-white bg-[#222]" : "text-[#888] hover:text-[#ccc]"
                        }`}
                        onClick={() => setActivePageId(page.id)}
                      >
                        <span className="text-[10px] opacity-50">
                          {page.paper === "grid" ? "▦" : page.paper === "college-ruled" ? "☰" : "☐"}
                        </span>
                        {editingPage === page.id ? (
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                            onBlur={commitRename} onKeyDown={e => e.key === "Enter" && commitRename()}
                            className="bg-[#252525] border border-[#444] rounded px-1 text-xs text-white w-full" />
                        ) : (
                          <span className="truncate flex-1" onDoubleClick={() => startRename("page", page.id, page.name)}>
                            {page.name}
                          </span>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "page", catId: cat.id, pageId: page.id }); }}
                          className="text-[#444] hover:text-[#e06060] opacity-0 group-hover:opacity-100 text-xs"
                          title="Delete section">×</button>
                      </div>
                    ))}
                    {/* Add section buttons */}
                    <div className="flex gap-1 pl-3 py-1">
                      <button onClick={() => addPage(cat.id, "blank")}
                        className="text-[10px] text-[#555] hover:text-[#aaa] px-1" title="Blank section">+ ☐</button>
                      <button onClick={() => addPage(cat.id, "grid")}
                        className="text-[10px] text-[#555] hover:text-[#aaa] px-1" title="Grid section">+ ▦</button>
                      <button onClick={() => addPage(cat.id, "college-ruled")}
                        className="text-[10px] text-[#555] hover:text-[#aaa] px-1" title="College ruled section">+ ☰</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#141414] border-b border-[#2a2a2a] flex-wrap">
          {/* Sidebar toggle */}
          <button onClick={() => setSidebarOpen(s => !s)}
            className="text-[#666] hover:text-white text-sm px-1" title="Toggle sidebar">
            {sidebarOpen ? "◁" : "▷"}
          </button>

          <div className="w-px h-5 bg-[#2a2a2a]" />

          {/* Tools */}
          {(["pen", "highlighter", "eraser"] as const).map(t => (
            <button key={t} onClick={() => setTool(t)}
              className={`px-2 py-0.5 rounded text-xs capitalize ${
                tool === t ? "bg-[#333] text-white" : "text-[#888] hover:text-white"
              }`}>
              {t === "pen" ? "✏ Pen" : t === "highlighter" ? "🖍 Highlight" : "⌫ Eraser"}
            </button>
          ))}

          <div className="w-px h-5 bg-[#2a2a2a]" />

          {/* Thickness */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#666]">Size</span>
            {THICKNESS_OPTIONS.map(t => (
              <button key={t} onClick={() => setThickness(t)}
                className={`w-5 h-5 rounded flex items-center justify-center ${
                  thickness === t ? "bg-[#333]" : "hover:bg-[#222]"
                }`} title={`${t}px`}>
                <span className="rounded-full bg-white" style={{ width: Math.min(t + 2, 12), height: Math.min(t + 2, 12) }} />
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-[#2a2a2a]" />

          {/* Colors */}
          {tool === "highlighter" ? (
            <div className="flex items-center gap-1">
              {HIGHLIGHTER_COLORS.map(c => (
                <button key={c} onClick={() => setHlColor(c)}
                  className={`w-5 h-5 rounded border ${hlColor === c ? "border-white" : "border-[#444]"}`}
                  style={{ background: c }} />
              ))}
            </div>
          ) : tool === "pen" ? (
            <div className="flex items-center gap-1">
              {COLORS.map(c => (
                <button key={c} onClick={() => setPenColor(c)}
                  className={`w-5 h-5 rounded border ${penColor === c ? "border-white" : "border-[#444]"}`}
                  style={{ background: c }} />
              ))}
            </div>
          ) : null}

          <div className="w-px h-5 bg-[#2a2a2a]" />

          {/* Paper type */}
          {activePage && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[#666]">Paper</span>
              {(["blank", "grid", "college-ruled"] as PaperType[]).map(p => (
                <button key={p} onClick={() => changePaper(p)}
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    activePage.paper === p ? "bg-[#333] text-white" : "text-[#888] hover:text-white"
                  }`}>
                  {p === "blank" ? "☐ Blank" : p === "grid" ? "▦ Grid" : "☰ Ruled"}
                </button>
              ))}
            </div>
          )}

          <div className="w-px h-5 bg-[#2a2a2a]" />

          {/* Add Page */}
          {activeCat && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[#666]">Add Section</span>
              <button onClick={() => addPage(activeCat.id, "blank")}
                className="px-1.5 py-0.5 rounded text-[10px] text-[#888] hover:text-white hover:bg-[#333]">☐ Blank</button>
              <button onClick={() => addPage(activeCat.id, "grid")}
                className="px-1.5 py-0.5 rounded text-[10px] text-[#888] hover:text-white hover:bg-[#333]">▦ Grid</button>
              <button onClick={() => addPage(activeCat.id, "college-ruled")}
                className="px-1.5 py-0.5 rounded text-[10px] text-[#888] hover:text-white hover:bg-[#333]">☰ Ruled</button>
            </div>
          )}

          <div className="flex-1" />

          {/* Actions */}
          <button onClick={undo} className="text-[#666] hover:text-white text-xs px-1" title="Undo (Ctrl+Z)">↩</button>
          <button onClick={redo} className="text-[#666] hover:text-white text-xs px-1" title="Redo (Ctrl+Y)">↪</button>
          <button onClick={clearPage} className="text-[#666] hover:text-[#e06060] text-xs px-1" title="Clear page">🗑</button>
        </div>

        {/* ── Scrollable canvas area ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ cursor: "url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22><circle cx=%225%22 cy=%225%22 r=%224%22 fill=%22white%22 stroke=%22black%22 stroke-width=%221%22/></svg>') 5 5, auto" }}>
          <div ref={containerRef}>
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={{ touchAction: "none", display: "block" }}
            />
            {/* ── Drag handle to extend page ── */}
            <div
              className="flex items-center justify-center py-2 cursor-ns-resize select-none group hover:bg-[#252525] transition-colors"
              style={{ touchAction: "none" }}
              onPointerDown={handleDragStart}
            >
              <div className="flex flex-col items-center gap-0.5">
                <div className="w-16 h-0.5 bg-[#333] group-hover:bg-[#555] rounded" />
                <div className="w-10 h-0.5 bg-[#333] group-hover:bg-[#555] rounded" />
              </div>
              <span className="ml-2 text-[10px] text-[#444] group-hover:text-[#888]">extend</span>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmDelete(null)}>
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-semibold text-base">
              Delete {confirmDelete.type === "cat" ? "Notebook" : "Section"}
            </h2>
            <p className="text-[#aaa] text-sm">
              Are you sure you want to delete this {confirmDelete.type === "cat" ? "notebook" : "section"}? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 bg-[#1a1a1a] border border-[#333] text-[#aaa] hover:text-white text-sm rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === "cat") deleteCategory(confirmDelete.catId);
                  else if (confirmDelete.pageId) deletePage(confirmDelete.catId, confirmDelete.pageId);
                  setConfirmDelete(null);
                }}
                className="px-3 py-1.5 bg-[#cc5555] hover:bg-[#aa3333] text-white text-sm rounded font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
