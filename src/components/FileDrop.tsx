import { useId, useMemo, useState } from "react";

type Props = {
  onFiles: (files: File[]) => void | Promise<void>;
};

const ACCEPT = [".ttl", ".n3", ".nt", ".rdf", ".owl", ".xml", ".json", ".jsonld"].join(",");

export default function FileDrop(props: Props) {
  const inputId = useId();
  const [isOver, setIsOver] = useState(false);

  const hint = useMemo(() => {
    return "Drop RDF/OWL/JSON-LD files here (or click to browse).";
  }, []);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    await props.onFiles(files);
  }

  return (
    <div
      className={`dropZone ${isOver ? "dropZoneOver" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setIsOver(false);
        await handleFiles(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          const el = document.getElementById(inputId) as HTMLInputElement | null;
          el?.click();
        }
      }}
      onClick={() => {
        const el = document.getElementById(inputId) as HTMLInputElement | null;
        el?.click();
      }}
    >
      <div className="dropTitle">Import ontology</div>
      <div className="dropHint">{hint}</div>

      <div className="dropMeta">
        <span className="pill">Turtle</span>
        <span className="pill">RDF/XML</span>
        <span className="pill">OWL</span>
        <span className="pill">JSON-LD</span>
      </div>

      <input
        id={inputId}
        className="fileInput"
        type="file"
        accept={ACCEPT}
        multiple
        onChange={async (e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

