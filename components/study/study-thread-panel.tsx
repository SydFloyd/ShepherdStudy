"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { StudyThreadSummary } from "@/lib/study-client-contract";

type Props = {
  threads: StudyThreadSummary[];
  activeThreadId: string | null;
  isLoading: boolean;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
};

type ThreadMenuState = {
  threadId: string;
  title: string;
  anchor: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
};

export function StudyThreadPanel({
  threads,
  activeThreadId,
  isLoading,
  onNewThread,
  onSelectThread,
  onArchiveThread,
  onRenameThread
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [menu, setMenu] = useState<ThreadMenuState | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (menuRef.current.contains(target)) {
        return;
      }
      if (target.closest(".studyThreadActionsButton")) {
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

  useEffect(() => {
    if (!menu) {
      setMenuPosition(null);
      return;
    }

    function positionMenu() {
      if (!menuRef.current) {
        return;
      }

      const menuRect = menuRef.current.getBoundingClientRect();
      const horizontalPadding = 8;
      const verticalPadding = 8;

      let left = menu.anchor.right - menuRect.width;
      const maxLeft = window.innerWidth - menuRect.width - horizontalPadding;
      left = Math.min(Math.max(horizontalPadding, left), Math.max(horizontalPadding, maxLeft));

      let top = menu.anchor.bottom + 6;
      if (top + menuRect.height > window.innerHeight - verticalPadding) {
        top = menu.anchor.top - menuRect.height - 6;
      }
      top = Math.max(verticalPadding, top);

      setMenuPosition((current) => {
        if (current && current.left === left && current.top === top) {
          return current;
        }
        return { top, left };
      });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [menu]);

  return (
    <>
      <article className="card studyThreadPanel">
        <div className="studyThreadHeader">
          <h2>History</h2>
          <div className="studyThreadHeaderActions">
            <button
              type="button"
              className="studyThreadNewButton"
              aria-label="Start a new study"
              onClick={onNewThread}
            >
              +
            </button>
            <button
              type="button"
              className={`studyThreadCollapseButton${isCollapsed ? " collapsed" : ""}`}
              aria-label={isCollapsed ? "Expand study history" : "Collapse study history"}
              aria-expanded={!isCollapsed}
              onClick={() => {
                setMenu(null);
                setIsCollapsed((current) => !current);
              }}
            >
              <span aria-hidden="true">v</span>
            </button>
          </div>
        </div>

        {!isCollapsed ? (
          <>
            {isLoading ? <p className="muted">Loading history...</p> : null}
            {!isLoading && threads.length === 0 ? (
              <p className="muted">No saved studies yet.</p>
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
                      aria-expanded={menu?.threadId === thread.id}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setMenu((current) =>
                          current?.threadId === thread.id
                            ? null
                            : {
                                threadId: thread.id,
                                title: thread.title,
                                anchor: {
                                  top: rect.top,
                                  left: rect.left,
                                  right: rect.right,
                                  bottom: rect.bottom
                                }
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
          </>
        ) : null}
      </article>
      {menu && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="studyThreadMenu"
              style={{
                top: `${menuPosition?.top ?? menu.anchor.bottom + 6}px`,
                left: `${menuPosition?.left ?? menu.anchor.left}px`
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const nextTitle = window.prompt("Rename study", menu.title);
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
            </div>,
            document.body
          )
        : null}
    </>
  );
}
