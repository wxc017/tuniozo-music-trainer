import { useState, useRef, useCallback, useEffect } from "react";
import { useLS } from "@/lib/storage";

/* ────────────────────────────────────────────────────────────── */
/*  Types                                                         */
/* ────────────────────────────────────────────────────────────── */

interface Doc {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeDoc(): Doc {
  const now = Date.now();
  return { id: uid(), title: "Untitled", body: "", createdAt: now, updatedAt: now };
}

/* ────────────────────────────────────────────────────────────── */
/*  Toolbar button                                                */
/* ────────────────────────────────────────────────────────────── */

function Btn({
  label, active, onClick, title,
}: { label: string; active?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className={`px-2 py-1 text-xs rounded font-bold select-none ${
        active ? "bg-[#3a3a3a] text-white" : "text-[#aaa] hover:bg-[#2a2a2a] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Component                                                     */
/* ────────────────────────────────────────────────────────────── */

export default function SimpleDoc() {
  const [docs, setDocs] = useLS<Doc[]>("lt_simple_docs", [makeDoc()]);
  const active0 = docs.length > 0 ? docs[0] : null;
  const [activeId, setActiveId] = useLS<string>("lt_simple_docs_active", active0?.id ?? "");
  const editorRef = useRef<HTMLDivElement>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  const active = docs.find(d => d.id === activeId) ?? docs[0];

  // ── Formatting ──────────────────────────────────────────────
  const exec = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  }, []);

  // ── Save body on input ──────────────────────────────────────
  const saveBody = useCallback(() => {
    if (!editorRef.current || !active) return;
    const html = editorRef.current.innerHTML;
    setDocs(prev => prev.map(d =>
      d.id === active.id ? { ...d, body: html, updatedAt: Date.now() } : d
    ));
  }, [active, setDocs]);

  // ── Sync editor content when switching docs ─────────────────
  useEffect(() => {
    if (editorRef.current && active) {
      editorRef.current.innerHTML = active.body;
    }
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Doc CRUD ────────────────────────────────────────────────
  const addDoc = () => {
    const d = makeDoc();
    setDocs(prev => [...prev, d]);
    setActiveId(d.id);
  };

  const deleteDoc = (id: string) => {
    setDocs(prev => {
      const next = prev.filter(d => d.id !== id);
      if (next.length === 0) {
        const d = makeDoc();
        next.push(d);
      }
      if (activeId === id) setActiveId(next[0].id);
      return next;
    });
  };

  const renameDoc = (id: string, title: string) => {
    setDocs(prev => prev.map(d =>
      d.id === id ? { ...d, title, updatedAt: Date.now() } : d
    ));
  };

  // ── Word / char count ───────────────────────────────────────
  const plainText = active?.body?.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim() ?? "";
  const words = plainText ? plainText.split(/\s+/).length : 0;
  const chars = plainText.length;

  if (!active) return null;

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* ── Sidebar ── */}
      {showSidebar && (
        <div className="w-52 flex-shrink-0 border-r border-[#2a2a2a] bg-[#111] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
            <span className="text-[10px] uppercase tracking-wider text-[#666]">Documents</span>
            <button
              onClick={addDoc}
              className="text-xs text-[#888] hover:text-white px-1"
              title="New document"
            >+</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {docs.map(d => (
              <div
                key={d.id}
                onClick={() => setActiveId(d.id)}
                className={`group flex items-center px-3 py-2 cursor-pointer text-xs border-b border-[#1a1a1a] ${
                  d.id === activeId ? "bg-[#1e1e1e] text-white" : "text-[#888] hover:bg-[#181818]"
                }`}
              >
                <span className="flex-1 truncate">{d.title}</span>
                {docs.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteDoc(d.id); }}
                    className="hidden group-hover:block text-[#666] hover:text-red-400 ml-1"
                  >&times;</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a] bg-[#141414]">
          <button
            onClick={() => setShowSidebar(v => !v)}
            className="text-xs text-[#666] hover:text-white"
            title="Toggle sidebar"
          >{showSidebar ? "◀" : "▶"}</button>
          <input
            value={active.title}
            onChange={e => renameDoc(active.id, e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-white flex-1 font-medium"
            placeholder="Untitled"
          />
          <span className="text-[10px] text-[#555]">{words}w &middot; {chars}c</span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-1 border-b border-[#2a2a2a] bg-[#141414] flex-wrap">
          <Btn label="B" onClick={() => exec("bold")} title="Bold" />
          <Btn label="I" onClick={() => exec("italic")} title="Italic" />
          <Btn label="U" onClick={() => exec("underline")} title="Underline" />
          <Btn label="S" onClick={() => exec("strikeThrough")} title="Strikethrough" />
          <span className="w-px h-4 bg-[#2a2a2a] mx-1" />
          <Btn label="H1" onClick={() => exec("formatBlock", "h1")} title="Heading 1" />
          <Btn label="H2" onClick={() => exec("formatBlock", "h2")} title="Heading 2" />
          <Btn label="H3" onClick={() => exec("formatBlock", "h3")} title="Heading 3" />
          <Btn label="¶" onClick={() => exec("formatBlock", "p")} title="Paragraph" />
          <span className="w-px h-4 bg-[#2a2a2a] mx-1" />
          <Btn label="• List" onClick={() => exec("insertUnorderedList")} title="Bullet list" />
          <Btn label="1. List" onClick={() => exec("insertOrderedList")} title="Numbered list" />
          <span className="w-px h-4 bg-[#2a2a2a] mx-1" />
          <Btn label="←" onClick={() => exec("outdent")} title="Outdent" />
          <Btn label="→" onClick={() => exec("indent")} title="Indent" />
          <span className="w-px h-4 bg-[#2a2a2a] mx-1" />
          <Btn label="Clear" onClick={() => exec("removeFormat")} title="Clear formatting" />
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto bg-[#0d0d0d]">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={saveBody}
            className="simple-doc-editor min-h-full max-w-3xl mx-auto px-8 py-6 outline-none text-sm text-[#ddd] leading-relaxed"
            style={{ caretColor: "#fff" }}
          />
        </div>
      </div>

      {/* Editor styles */}
      <style>{`
        .simple-doc-editor h1 { font-size: 1.75em; font-weight: 700; margin: 0.6em 0 0.3em; color: #fff; }
        .simple-doc-editor h2 { font-size: 1.35em; font-weight: 600; margin: 0.5em 0 0.25em; color: #eee; }
        .simple-doc-editor h3 { font-size: 1.1em; font-weight: 600; margin: 0.4em 0 0.2em; color: #ddd; }
        .simple-doc-editor p { margin: 0.4em 0; }
        .simple-doc-editor ul, .simple-doc-editor ol { margin: 0.3em 0; padding-left: 1.5em; }
        .simple-doc-editor li { margin: 0.15em 0; }
        .simple-doc-editor b, .simple-doc-editor strong { font-weight: 700; }
        .simple-doc-editor i, .simple-doc-editor em { font-style: italic; }
        .simple-doc-editor u { text-decoration: underline; }
        .simple-doc-editor strike, .simple-doc-editor s { text-decoration: line-through; }
        .simple-doc-editor blockquote { border-left: 3px solid #444; padding-left: 1em; margin: 0.5em 0; color: #aaa; }
      `}</style>
    </div>
  );
}
