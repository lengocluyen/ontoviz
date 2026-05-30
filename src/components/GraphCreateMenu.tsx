import { useEffect, useMemo, useRef, useState } from "react";
import type { CreateEntityInput, CreateEntityKind } from "../lib/editor";

type Props = {
  enabled: boolean;
  baseIri: string;
  onCreateEntity: (input: CreateEntityInput) => Promise<string> | string;
  autoOpenToken?: number;
};

export default function GraphCreateMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastAutoOpenRef = useRef<number | null>(null);

  const [kind, setKind] = useState<CreateEntityKind>("class");
  const [iriInput, setIriInput] = useState("");
  const [label, setLabel] = useState("");
  const [lang, setLang] = useState("en");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [parentClassIri, setParentClassIri] = useState("");
  const [domainClassIri, setDomainClassIri] = useState("");
  const [rangeClassIri, setRangeClassIri] = useState("");
  const [individualTypeIri, setIndividualTypeIri] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = useMemo(() => {
    if (!props.enabled) return false;
    if (busy) return false;
    if (!iriInput.trim()) return false;
    return true;
  }, [busy, iriInput, props.enabled]);

  const showParent = kind === "class";
  const showDomainRange = kind === "objectProperty" || kind === "dataProperty";
  const showType = kind === "individual";

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
    if (!open) return;
    setError(null);
  }, [kind, open]);

  useEffect(() => {
    const token = props.autoOpenToken ?? 0;
    if (!props.enabled) return;
    if (!token) return;
    if (lastAutoOpenRef.current === token) return;
    lastAutoOpenRef.current = token;
    setOpen(true);
  }, [props.autoOpenToken, props.enabled]);

  function reset() {
    setIriInput("");
    setLabel("");
    setLang("en");
    setShowAdvanced(false);
    setParentClassIri("");
    setDomainClassIri("");
    setRangeClassIri("");
    setIndividualTypeIri("");
    setError(null);
  }

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const input: CreateEntityInput = {
        kind,
        iriInput: iriInput.trim(),
        label: label.trim() || undefined,
        lang: lang.trim() || undefined,
        parentClassIri: showParent ? parentClassIri.trim() || undefined : undefined,
        domainClassIri: showDomainRange ? domainClassIri.trim() || undefined : undefined,
        rangeClassIri: showDomainRange ? rangeClassIri.trim() || undefined : undefined,
        individualTypeIri: showType ? individualTypeIri.trim() || undefined : undefined,
      };
      await props.onCreateEntity(input);
      reset();
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const title = props.enabled ? "Create entity" : "Load/open an ontology to enable creation";

  return (
    <div ref={rootRef} className="menuRoot">
      <button
        className="iconButton"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        aria-label={title}
        title={title}
        disabled={!props.enabled}
      >
        <IconPlus />
      </button>

      {open ? (
        <div
          className="menuDropdown menuDropdownRight menuDropdownWide"
          role="dialog"
          aria-label="Create entity"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="menuHeader">
            <div className="menuHeaderTitle">Create entity</div>
            <div className="menuHeaderSub">Adds the minimal OWL/RDFS triples and focuses the new node.</div>
          </div>

          <div className="menuPad">
            <div className="field">
              <label className="label" htmlFor="graphCreateKind">
                Type
              </label>
              <select
                id="graphCreateKind"
                className="input miniSelect"
                value={kind}
                onChange={(e) => setKind(e.target.value as CreateEntityKind)}
                disabled={busy}
              >
                <option value="class">Class</option>
                <option value="objectProperty">Object property</option>
                <option value="dataProperty">Data property</option>
                <option value="annotationProperty">Annotation property</option>
                <option value="individual">Individual</option>
                <option value="concept">SKOS Concept</option>
              </select>
            </div>

            <div className="field mt10">
              <label className="label" htmlFor="graphCreateIri">
                IRI / CURIE / local name
              </label>
              <input
                id="graphCreateIri"
                className="input"
                value={iriInput}
                onChange={(e) => setIriInput(e.target.value)}
                placeholder={kind === "class" ? "Person" : kind.includes("Property") ? "hasFriend" : "Alice"}
                spellCheck={false}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter") create();
                }}
              />
              <div className="help">Base IRI: {props.baseIri}</div>
            </div>

            <div className="row gap8 mt10 wrap">
              <div className="field" style={{ flex: 1, minWidth: 200 }}>
                <label className="label" htmlFor="graphCreateLabel">
                  Label (optional)
                </label>
                <input
                  id="graphCreateLabel"
                  className="input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Human label…"
                  spellCheck={false}
                  disabled={busy}
                />
              </div>
              <div className="field" style={{ minWidth: 92 }}>
                <label className="label" htmlFor="graphCreateLang">
                  Lang
                </label>
                <input
                  id="graphCreateLang"
                  className="input miniInput"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  spellCheck={false}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="row gap8 mt10 wrap">
              <button
                className="button small"
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                disabled={busy}
                title="Show optional axioms"
              >
                {showAdvanced ? "Hide advanced" : "Advanced…"}
              </button>
            </div>

            {showAdvanced ? (
              <div className="mt10">
                {showParent ? (
                  <div className="field">
                    <label className="label" htmlFor="graphCreateParent">
                      Parent class (rdfs:subClassOf)
                    </label>
                    <input
                      id="graphCreateParent"
                      className="input"
                      value={parentClassIri}
                      onChange={(e) => setParentClassIri(e.target.value)}
                      placeholder="ex:Thing"
                      spellCheck={false}
                      disabled={busy}
                    />
                  </div>
                ) : null}

                {showDomainRange ? (
                  <div className="row gap8 mt10 wrap">
                    <div className="field" style={{ flex: 1, minWidth: 200 }}>
                      <label className="label" htmlFor="graphCreateDomain">
                        Domain (rdfs:domain)
                      </label>
                      <input
                        id="graphCreateDomain"
                        className="input"
                        value={domainClassIri}
                        onChange={(e) => setDomainClassIri(e.target.value)}
                        placeholder="ex:Person"
                        spellCheck={false}
                        disabled={busy}
                      />
                    </div>
                    <div className="field" style={{ flex: 1, minWidth: 200 }}>
                      <label className="label" htmlFor="graphCreateRange">
                        Range (rdfs:range)
                      </label>
                      <input
                        id="graphCreateRange"
                        className="input"
                        value={rangeClassIri}
                        onChange={(e) => setRangeClassIri(e.target.value)}
                        placeholder={kind === "dataProperty" ? "xsd:string" : "ex:Person"}
                        spellCheck={false}
                        disabled={busy}
                      />
                    </div>
                  </div>
                ) : null}

                {showType ? (
                  <div className="field mt10">
                    <label className="label" htmlFor="graphCreateType">
                      Type (rdf:type)
                    </label>
                    <input
                      id="graphCreateType"
                      className="input"
                      value={individualTypeIri}
                      onChange={(e) => setIndividualTypeIri(e.target.value)}
                      placeholder="ex:Person"
                      spellCheck={false}
                      disabled={busy}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="row gap8 mt12 wrap">
              <button className="button" type="button" onClick={create} disabled={!canCreate}>
                {busy ? "Creating…" : "Create"}
              </button>
              <button className="button" type="button" onClick={reset} disabled={busy}>
                Reset
              </button>
            </div>

            {error ? <div className="errorBox mt12">{error}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
