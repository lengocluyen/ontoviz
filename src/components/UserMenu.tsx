import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_USER_NAME = "auth:v1:userName";
const STORAGE_COMMENTS_AUTHOR = "comments:v1:author";

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [userName, setUserName] = useState(() => safeGetItem(STORAGE_USER_NAME) ?? "");
  const [draftName, setDraftName] = useState(userName);

  const title = useMemo(() => {
    const n = userName.trim();
    return n ? `User: ${n}` : "User menu";
  }, [userName]);

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
    setDraftName(userName);
  }, [userName]);

  function saveName(nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    safeSetItem(STORAGE_USER_NAME, trimmed);
    safeSetItem(STORAGE_COMMENTS_AUTHOR, trimmed);
    setUserName(trimmed);
    setOpen(false);
  }

  function signOut() {
    safeRemoveItem(STORAGE_USER_NAME);
    setUserName("");
    setDraftName("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="menuRoot">
      <button
        className="iconButton"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        aria-label={title}
        title={title}
      >
        <IconUser />
      </button>
      {open ? (
        <div className="menuDropdown menuDropdownRight" role="menu" aria-label="User menu">
          <div className="menuHeader">
            <div className="menuHeaderTitle">{userName.trim() ? userName.trim() : "Not signed in"}</div>
            <div className="menuHeaderSub">Local profile (prototype). Add real auth later.</div>
          </div>

          <div className="menuPad">
            <div className="field">
              <label className="label" htmlFor="userMenuName">
                Display name
              </label>
              <input
                id="userMenuName"
                className="input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Your name"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter") saveName(draftName);
                }}
              />
            </div>

            <div className="row gap8 mt10 wrap">
              <button className="button" type="button" onClick={() => saveName(draftName)} disabled={!draftName.trim()}>
                {userName.trim() ? "Save" : "Sign in"}
              </button>
              {userName.trim() ? (
                <button className="button danger" type="button" onClick={signOut} title="Clear local profile">
                  Sign out
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore (private mode / quota)
  }
}

function safeRemoveItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.5 21c1.9-4.1 5.2-6.1 7.5-6.1S17.1 16.9 19 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

