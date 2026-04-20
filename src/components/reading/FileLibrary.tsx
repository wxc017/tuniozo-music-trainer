import { useState, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  ReadingFile, loadReadingFiles, deleteReadingFile, newReadingFile,
  saveReadingFile, getCategories, getAuthorsByCategory,
  type CitationMeta,
} from "@/lib/readingWorkflowData";
import { storeFileBlob, deleteFileBlob } from "@/lib/fileStorage";

interface Props {
  files: ReadingFile[];
  onOpen: (file: ReadingFile) => void;
  onFilesChanged: () => void;
}

export default function FileLibrary({ files, onOpen, onFilesChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ name: string; type: ReadingFile["fileType"]; data: ArrayBuffer } | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [pendingCitation, setPendingCitation] = useState<CitationMeta>({});
  const [deletedFile, setDeletedFile] = useState<ReadingFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReadingFile | null>(null);
  const [editFile, setEditFile] = useState<ReadingFile | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const existingCategories = getCategories();
  const authorsForCategory = category.trim() ? getAuthorsByCategory(category.trim()) : [];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    let fileType: ReadingFile["fileType"];
    if (ext === "pdf") fileType = "pdf";
    else if (ext === "epub") fileType = "epub";
    else if (ext === "mobi") fileType = "mobi";
    else return;

    const data = await file.arrayBuffer();
    setPendingFile({ name: file.name, type: fileType, data });
    setTitle(file.name.replace(/\.[^.]+$/, ""));
    setAuthor("");
    setCategory(existingCategories[0] ?? "");
    setPendingCitation({});

    // Auto-extract metadata from PDF
    if (fileType === "pdf") {
      try {
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
        const metaResult = await doc.getMetadata();
        const info = metaResult?.info as Record<string, unknown> | undefined;
        if (info) {
          if (typeof info.Title === "string" && info.Title.trim()) setTitle(info.Title.trim());
          if (typeof info.Author === "string" && info.Author.trim()) setAuthor(info.Author.trim());
          const citation: CitationMeta = {};
          if (typeof info.Subject === "string" && info.Subject.trim()) citation.abstract = info.Subject.trim();
          if (typeof info.Producer === "string" && info.Producer.trim()) citation.publisher = info.Producer.trim();
          setPendingCitation(citation);
        }

        // Scan first 3 pages for DOI / ISBN
        const maxPages = Math.min(doc.numPages, 3);
        let scannedText = "";
        for (let i = 1; i <= maxPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          scannedText += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
        }
        const doiMatch = scannedText.match(/\b(10\.\d{4,}\/[^\s,;]+)/);
        const isbnMatch = scannedText.match(/ISBN[\s:-]*([\d-]{10,})/i);
        if (doiMatch || isbnMatch) {
          setPendingCitation(prev => ({
            ...prev,
            ...(doiMatch ? { doi: doiMatch[1].replace(/[.)]+$/, "") } : {}),
            ...(isbnMatch ? { isbn: isbnMatch[1] } : {}),
          }));
        }
        doc.destroy();
      } catch { /* metadata extraction is best-effort */ }
    }

    setShowImportDialog(true);
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!pendingFile || !title.trim()) return;
    setImporting(true);
    const rf = newReadingFile(title.trim(), author.trim(), category.trim() || "Uncategorized", pendingFile.name, pendingFile.type, pendingCitation);
    await storeFileBlob(rf.id, pendingFile.data);
    saveReadingFile(rf);
    setImporting(false);
    setShowImportDialog(false);
    setPendingFile(null);
    setTitle("");
    setAuthor("");
    setCategory("");
    setPendingCitation({});
    onFilesChanged();
  };

  const handleDelete = async (file: ReadingFile) => {
    setConfirmDelete(null);
    setDeletedFile(file);
    deleteReadingFile(file.id);
    await deleteFileBlob(file.id);
    onFilesChanged();
  };

  // Group files by category
  const grouped: Record<string, ReadingFile[]> = {};
  for (const f of files) {
    (grouped[f.category] ??= []).push(f);
  }
  const sortedCategories = Object.keys(grouped).sort();

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#888] uppercase tracking-widest">Reading Library</h2>
        <button
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 bg-[#7173e6] hover:bg-[#5a5cc7] text-white text-xs rounded font-medium transition-colors"
        >
          + Import File
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.epub,.mobi"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File list by category */}
      {files.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-[#444] text-sm mb-2">No files imported yet</div>
          <div className="text-[#333] text-xs">Import a PDF, EPUB, or MOBI to get started</div>
        </div>
      ) : (
        sortedCategories.map(cat => (
          <div key={cat}>
            <h3 className="text-xs font-semibold text-[#666] uppercase tracking-widest mb-2">{cat}</h3>
            <div className="space-y-1">
              {grouped[cat].sort((a, b) => a.title.localeCompare(b.title)).map(file => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg cursor-pointer transition-colors group"
                  onClick={() => onOpen(file)}
                >
                  <span className="text-xs text-[#555] uppercase font-mono w-10">{file.fileType}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#ccc] truncate">{file.title}</div>
                    {file.author && <div className="text-xs text-[#666] truncate">{file.author}</div>}
                    <div className="text-xs text-[#444]">
                      {file.textExtracts.length} texts · {file.notes.length} notes
                    </div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setEditFile(file);
                      setEditTitle(file.title);
                      setEditAuthor(file.author);
                      setEditCategory(file.category);
                    }}
                    className="text-[#444] hover:text-[#7173e6] text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Edit
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete(file); }}
                    className="text-[#444] hover:text-[#e06060] text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Edit file dialog */}
      {editFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) setEditFile(null); }}
        >
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-6 w-80 space-y-3">
            <h2 className="text-white font-semibold text-base">Edit File</h2>
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="Title…"
              autoFocus
              className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#7173e6]"
            />
            <div className="relative">
              <input
                value={editCategory}
                onChange={e => setEditCategory(e.target.value)}
                placeholder="Category…"
                list="edit-category-suggestions"
                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#7173e6]"
              />
              {existingCategories.length > 0 && (
                <datalist id="edit-category-suggestions">
                  {existingCategories.map(c => <option key={c} value={c} />)}
                </datalist>
              )}
            </div>
            <div className="relative">
              <input
                value={editAuthor}
                onChange={e => setEditAuthor(e.target.value)}
                placeholder="Author…"
                list="edit-author-suggestions"
                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#7173e6]"
              />
              {(editCategory.trim() ? getAuthorsByCategory(editCategory.trim()) : []).length > 0 && (
                <datalist id="edit-author-suggestions">
                  {(editCategory.trim() ? getAuthorsByCategory(editCategory.trim()) : []).map(a => <option key={a} value={a} />)}
                </datalist>
              )}
            </div>
            <button
              disabled={!editTitle.trim()}
              onClick={() => {
                const updated = {
                  ...editFile,
                  title: editTitle.trim(),
                  author: editAuthor.trim(),
                  category: editCategory.trim() || "Uncategorized",
                  updatedAt: Date.now(),
                };
                saveReadingFile(updated);
                setEditFile(null);
                onFilesChanged();
              }}
              className="w-full bg-[#7173e6] disabled:opacity-40 hover:bg-[#5a5cc7] text-white text-sm rounded py-2 font-medium transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setEditFile(null)}
              className="w-full text-xs text-[#555] hover:text-[#888]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation popup */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-6 w-80 space-y-4">
            <h2 className="text-white font-semibold text-base">Delete File</h2>
            <p className="text-sm text-[#999]">
              Are you sure you want to delete <span className="text-[#ccc] font-medium">{confirmDelete.title}</span>?
              This will also remove all its text extracts and notes.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 bg-[#e06060] hover:bg-[#c04040] text-white text-sm rounded py-2 font-medium transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-[#aaa] text-sm rounded py-2 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete undo toast */}
      {deletedFile && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 shadow-lg">
          <span className="text-[#aaa] text-sm">File deleted</span>
        </div>
      )}

      {/* Import dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) { setShowImportDialog(false); setPendingFile(null); } }}
        >
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-6 w-80 space-y-3">
            <h2 className="text-white font-semibold text-base">Import File</h2>
            <div className="text-xs text-[#555] truncate">{pendingFile?.name}</div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Title…"
              autoFocus
              className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#7173e6]"
            />
            <div className="relative">
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="Category…"
                list="category-suggestions"
                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#7173e6]"
              />
              {existingCategories.length > 0 && (
                <datalist id="category-suggestions">
                  {existingCategories.map(c => <option key={c} value={c} />)}
                </datalist>
              )}
            </div>
            <div className="relative">
              <input
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="Author…"
                list="author-suggestions"
                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#7173e6]"
              />
              {authorsForCategory.length > 0 && (
                <datalist id="author-suggestions">
                  {authorsForCategory.map(a => <option key={a} value={a} />)}
                </datalist>
              )}
            </div>
            <button
              disabled={!title.trim() || importing}
              onClick={handleImport}
              className="w-full bg-[#7173e6] disabled:opacity-40 hover:bg-[#5a5cc7] text-white text-sm rounded py-2 font-medium transition-colors"
            >
              {importing ? "Importing…" : "Import"}
            </button>
            <button
              onClick={() => { setShowImportDialog(false); setPendingFile(null); }}
              className="w-full text-xs text-[#555] hover:text-[#888]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
