"use client";

import { useEffect, useRef, useState } from "react";

import { WwjdThreadSummary } from "@/lib/wwjd-contract";

type Props = {
  threads: WwjdThreadSummary[];
  activeThreadId: string | null;
  isLoading: boolean;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
};

export function WwjdThreadPanel({
  threads,
  activeThreadId,
  isLoading,
  onNewThread,
  onSelectThread,
  onArchiveThread,
  onRenameThread
}: Props) {
  const [menu, setMenu] = useState<{
    threadId: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }
      const target = event.target as Node | null;
      if (target && menuRef.current.contains(target)) {
        return;
      }
      setMenu(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <article className="card studyThreadPanel">
      <div className="studyThreadHeader">
        <h2>WWJD Chats</h2>
        <button type="button" className="studyThreadNewButton" onClick={onNewThread}>
          New
        </button>
      </div>

      {isLoading ? <p className="muted">Loading history...</p> : null}
      {!isLoading && threads.length === 0 ? (
        <p className="muted">No saved WWJD chats yet.</p>
      ) : null}

      {threads.length > 0 ? (
        <div className="studyThreadList">
          {threads.map((thread) => (
            <div key={thread.id} className="studyThreadItem">
              <button
                type="button"
                className={`studyThreadSelectButton${thread.id === activeThreadId ? " active" : ""}`}
                onClick={() => onSelectThread(thread.id)}
              >
                <span>{thread.title}</span>
              </button>
              <button
                type="button"
                className="studyThreadActionsButton"
                aria-label={`Actions for ${thread.title}`}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu((current) =>
                    current?.threadId === thread.id
                      ? null
                      : {
                          threadId: thread.id,
                          title: thread.title,
                          x: Math.max(
                            8,
                            Math.min(rect.right - 124, window.innerWidth - 132)
                          ),
                          y: Math.max(
                            8,
                            Math.min(rect.bottom + 6, window.innerHeight - 120)
                          )
                        }
                  );
                }}
              >
                ...
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {menu ? (
        <div
          ref={menuRef}
          className="studyThreadMenu popup"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            onClick={() => {
              const nextTitle = window.prompt("Rename WWJD chat", menu.title);
              if (nextTitle && nextTitle.trim()) {
                onRenameThread(menu.threadId, nextTitle.trim());
              }
              setMenu(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              onArchiveThread(menu.threadId);
              setMenu(null);
            }}
          >
            Archive
          </button>
        </div>
      ) : null}
    </article>
  );
}
