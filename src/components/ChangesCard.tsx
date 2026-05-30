import type { StoreChange } from "../lib/changeLog";
import { formatChangeLine } from "../lib/changeLog";

type Props = {
  enabled: boolean;
  undoStack: StoreChange[];
  redoStack: StoreChange[];
  onUndo: () => void;
  onRedo: () => void;
  onClearHistory?: () => void;
};

export default function ChangesCard(props: Props) {
  const canUndo = props.enabled && props.undoStack.length > 0;
  const canRedo = props.enabled && props.redoStack.length > 0;
  const recent = props.undoStack.slice(-12).reverse();

  return (
    <div className="card">
      <div className="cardTitle">Changes</div>

      {props.enabled ? (
        <div className="row gap8 wrap">
          <button className="button" type="button" disabled={!canUndo} onClick={props.onUndo}>
            Undo
          </button>
          <button className="button" type="button" disabled={!canRedo} onClick={props.onRedo}>
            Redo
          </button>
          {props.onClearHistory ? (
            <button
              className="button danger"
              type="button"
              disabled={props.undoStack.length === 0 && props.redoStack.length === 0}
              onClick={props.onClearHistory}
            >
              Reset
            </button>
          ) : null}
          <div className="help">
            {props.undoStack.length} undo / {props.redoStack.length} redo
          </div>
        </div>
      ) : (
        <div className="mutedSmall">Load RDF/OWL/JSON-LD to track changes and use undo/redo.</div>
      )}

      {recent.length > 0 ? (
        <div className="changeList mt10">
          {recent.map((c) => (
            <div key={c.id} className="changeRow mono" title={new Date(c.at).toLocaleString()}>
              {formatChangeLine(c)}
            </div>
          ))}
        </div>
      ) : props.enabled ? (
        <div className="muted mt10">No edits yet.</div>
      ) : null}
    </div>
  );
}

