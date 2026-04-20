import { useEffect, useRef, memo } from "react";
import { renderPermutationToVexFlow } from "./permutationRenderer";
import type { Permutation } from "@/lib/konnakolData";

interface Props {
  permutation: Permutation;
  selected?: boolean;
  onClick?: () => void;
  index?: number;
}

const GROUP_W = 42;
const ROW_H = 80;

export const SubdivisionPermutationRow = memo(function SubdivisionPermutationRow({
  permutation,
  selected = false,
  onClick,
  index,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const numGroups = permutation.length;
  const W = Math.max(140, numGroups * GROUP_W + 60);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    renderPermutationToVexFlow(el, permutation, W, ROW_H, true);
  }, [permutation, W]);

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "2px 6px",
        borderRadius: 6,
        cursor: "pointer",
        border: `1.5px solid ${selected ? "#9999ee" : "#1e1e1e"}`,
        background: selected ? "#9999ee18" : "#0a0a0a",
        transition: "all 80ms",
        width: "fit-content",
        alignSelf: "center",
      }}
    >
      {index !== undefined && (
        <span style={{ fontSize: 9, color: "#444", minWidth: 20, flexShrink: 0, fontFamily: "monospace", textAlign: "right" }}>
          {index + 1}.
        </span>
      )}
      <div
        ref={ref}
        style={{ width: W, height: ROW_H, flexShrink: 0, overflow: "hidden" }}
      />
    </button>
  );
});
