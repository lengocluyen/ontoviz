import { useEffect, useMemo, useState } from "react";
import type { GraphNode } from "../lib/graphModel";
import { hashString } from "../lib/ontology";

type Comment = {
  id: string;
  author: string;
  text: string;
  at: number;
};

type Props = {
  node: GraphNode | null;
};

export default function CommentsCard(props: Props) {
  const storageKey = useMemo(() => {
    if (!props.node?.id) return null;
    return `comments:v1:node:${props.node.id}`;
  }, [props.node?.id]);

  const [comments, setComments] = useState<Comment[]>([]);
  const [author, setAuthor] = useState(() => localStorage.getItem("comments:v1:author") ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) {
      setComments([]);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as Comment[]) : [];
      setComments(Array.isArray(parsed) ? parsed : []);
    } catch {
      setComments([]);
    }
  }, [storageKey]);

  function persist(next: Comment[]) {
    setComments(next);
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function add() {
    if (!storageKey) return;
    const a = author.trim();
    const t = text.trim();
    if (!a || !t) {
      setError("Author and comment text are required.");
      return;
    }
    setError(null);
    localStorage.setItem("comments:v1:author", a);
    const at = Date.now();
    const id = `c:${hashString(`${storageKey}|${a}|${t}|${at}`)}`;
    persist([{ id, author: a, text: t, at }, ...comments]);
    setText("");
  }

  return (
    <div className="card">
      <div className="cardTitle">Comments</div>
      {props.node ? (
        <div className="mutedSmall">
          Comments are stored locally in your browser (prototype). Later: shared threads, mentions, and approvals.
        </div>
      ) : (
        <div className="mutedSmall">Select a node to view/add comments.</div>
      )}

      {props.node ? (
        <>
          <div className="commentList mt10">
            {comments.length === 0 ? <div className="mutedSmall">No comments yet.</div> : null}
            {comments.map((c) => (
              <div key={c.id} className="commentItem">
                <div className="commentMeta">
                  <span className="commentAuthor">{c.author}</span>
                  <span className="mutedSmall">{formatTime(c.at)}</span>
                </div>
                <div className="commentText">{c.text}</div>
                <button
                  type="button"
                  className="button small danger"
                  onClick={() => persist(comments.filter((x) => x.id !== c.id))}
                  title="Delete comment (local)"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <div className="row gap8 mt10 wrap">
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label className="label" htmlFor="commentAuthor">
                Author
              </label>
              <input
                id="commentAuthor"
                className="input"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="field mt10">
            <label className="label" htmlFor="commentText">
              Comment
            </label>
            <textarea
              id="commentText"
              className="textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a review note, question, or suggestion…"
              rows={3}
            />
          </div>

          <div className="row gap8 mt10 wrap">
            <button className="button" type="button" onClick={add}>
              Add comment
            </button>
          </div>

          {error ? <div className="errorBox mt10">{error}</div> : null}
        </>
      ) : null}
    </div>
  );
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

