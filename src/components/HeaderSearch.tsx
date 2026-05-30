import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode } from "../lib/graphModel";

type Props = {
  value: string;
  onChange: (value: string) => void;
  matches: GraphNode[];
  onSelectNodeId: (id: string) => void;
};

export default function HeaderSearch(props: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const visibleMatches = useMemo(() => props.matches.slice(0, 8), [props.matches]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [props.value]);

  function selectIndex(idx: number) {
    const node = visibleMatches[idx];
    if (!node) return;
    props.onSelectNodeId(node.id);
    setOpen(false);
  }

  const showDropdown = open && props.value.trim().length > 0 && visibleMatches.length > 0;

  return (
    <div ref={rootRef} className="headerSearch">
      <input
        className="headerSearchInput"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="Search label or IRI…"
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(visibleMatches.length - 1, i + 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.max(0, i - 1));
            return;
          }
          if (e.key === "Enter") {
            if (!showDropdown) {
              setOpen(true);
              return;
            }
            e.preventDefault();
            selectIndex(activeIndex);
          }
        }}
      />

      {showDropdown ? (
        <div className="headerSearchDropdown" role="listbox" aria-label="Search results">
          {visibleMatches.map((n, idx) => (
            <button
              key={n.id}
              type="button"
              className={`headerSearchItem ${idx === activeIndex ? "active" : ""}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => selectIndex(idx)}
              title={n.iri ?? n.id}
            >
              <div className="headerSearchTitle">{n.label}</div>
              <div className="headerSearchMeta">
                <span className="pill small">{n.kind}</span>
                <span className="mutedSmall">{n.iri ?? n.id}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

