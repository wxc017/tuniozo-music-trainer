import { useState, useRef, useEffect, useCallback } from "react";
import type { PenStroke } from "@/lib/readingWorkflowData";

interface Props {
  selectedText: string;
  onSave: (noteText: string, penStrokes: PenStroke[]) => void;
  onCancel: () => void;
}

export default function NoteEditor({ selectedText, onSave, onCancel }: Props) {
  const [noteText, setNoteText] = useState("");
  const [penMode, setPenMode] = useState(false);
  const [strokes, setStrokes] = useState<PenStroke[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentStroke = useRef<{ x: number; y: number; pressure: number }[]>([]);
  const drawing = useRef(false);

  // Draw existing strokes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        ctx.lineWidth = stroke.width * Math.max(0.3, p.pressure);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }, [strokes]);

  useEffect(() => { redraw(); }, [redraw]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!penMode) return;
    drawing.current = true;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    currentStroke.current = [{
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    }];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !penMode) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    };
    currentStroke.current.push(point);

    // Draw live
    const ctx = canvas.getContext("2d")!;
    const pts = currentStroke.current;
    if (pts.length >= 2) {
      const prev = pts[pts.length - 2];
      ctx.beginPath();
      ctx.strokeStyle = "#ccc";
      ctx.lineWidth = 2 * Math.max(0.3, point.pressure);
      ctx.lineCap = "round";
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  };

  const handlePointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length >= 2) {
      setStrokes(prev => [...prev, {
        points: currentStroke.current,
        color: "#ccc",
        width: 2,
      }]);
    }
    currentStroke.current = [];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5 w-[500px] max-h-[80vh] overflow-y-auto space-y-3">
        <h3 className="text-sm font-semibold text-white">Add Note</h3>

        {/* Selected text */}
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-3">
          <div className="text-[10px] text-[#555] uppercase tracking-widest mb-1">Selected text</div>
          {selectedText.startsWith("data:image/") ? (
            <img src={selectedText} alt="Selection" className="rounded w-full" />
          ) : (
            <div className="text-xs text-[#999] max-h-32 overflow-y-auto whitespace-pre-wrap">{selectedText}</div>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setPenMode(false)}
            className={`px-3 py-1 text-xs rounded transition-colors ${!penMode ? "bg-[#7173e6] text-white" : "bg-[#1a1a1a] text-[#666] border border-[#2a2a2a]"}`}
          >
            Keyboard
          </button>
          <button
            onClick={() => setPenMode(true)}
            className={`px-3 py-1 text-xs rounded transition-colors ${penMode ? "bg-[#7173e6] text-white" : "bg-[#1a1a1a] text-[#666] border border-[#2a2a2a]"}`}
          >
            Pen
          </button>
        </div>

        {/* Keyboard input */}
        {!penMode && (
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Write your note…"
            autoFocus
            rows={5}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7173e6] resize-none"
          />
        )}

        {/* Pen canvas */}
        {penMode && (
          <div className="border border-[#333] rounded-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              width={460}
              height={200}
              className="bg-[#1a1a1a] cursor-crosshair touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            {strokes.length > 0 && (
              <button
                onClick={() => { setStrokes([]); redraw(); }}
                className="w-full text-xs text-[#555] hover:text-[#888] py-1"
              >
                Clear drawing
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-xs text-[#555] hover:text-[#888]">
            Cancel
          </button>
          <button
            onClick={() => onSave(noteText, strokes)}
            disabled={!noteText.trim() && strokes.length === 0}
            className="px-4 py-1.5 text-xs bg-[#5a8a5a] hover:bg-[#4a7a4a] disabled:opacity-40 text-white rounded font-medium transition-colors"
          >
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
}
