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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [menu, setMenu] = useState<{
    threadId: string;
    title: string;
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
        <h2>Chat History</h2>
        <div className="studyThreadHeaderActions">
          <button type="button" className="studyThreadNewButton" onClick={onNewThread}>
            New
          </button>
          <button
            type="button"
            className={`studyThreadCollapseButton${isCollapsed ? " collapsed" : ""}`}
            aria-label={isCollapsed ? "Expand chat history" : "Collapse chat history"}
            aria-expanded={!isCollapsed}
            onClick={() => {
              setMenu(null);
              setIsCollapsed((current) => !current);
            }}
          >
            <span aria-hidden="true">▾</span>
          </button>
        </div>
      </div>

      {!isCollapsed ? (
        <>
          {isLoading ? <p className="muted">Loading history...</p> : null}
          {!isLoading && threads.length === 0 ? (
            <p className="muted">No saved chat history yet.</p>
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
                    onClick={() => {
                      setMenu((current) =>
                        current?.threadId === thread.id
                          ? null
                          : {
                              threadId: thread.id,
                              title: thread.title
                            }
                      );
                    }}
                  >
                    ...
                  </button>
                  {menu?.threadId === thread.id ? (
                    <div ref={menuRef} className="studyThreadMenu inline">
                      <button
                        type="button"
                        onClick={() => {
                          const nextTitle = window.prompt("Rename ShepherdAI chat", menu.title);
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
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
