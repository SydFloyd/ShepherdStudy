import { useEffect, useState } from "react";

import { StudyTurn } from "@/lib/study-client-contract";

export function useStudyNavigation(turns: StudyTurn[]) {
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    const observed = Array.from(
      document.querySelectorAll<HTMLElement>("[data-graph-node-id]")
    ).filter((element) => Boolean(element.dataset.graphNodeId));

    if (observed.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) {
          return;
        }

        const nodeId = (visible.target as HTMLElement).dataset.graphNodeId;
        if (nodeId) {
          setFocusedNodeId(nodeId);
        }
      },
      {
        threshold: [0.25, 0.5, 0.75],
        rootMargin: "-18% 0px -48% 0px"
      }
    );

    observed.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [turns]);

  function onGraphNodeSelect(nodeId: string) {
    const turn = turns.find((item) => item.graphNodeId === nodeId);
    if (!turn) {
      return;
    }

    const element = document.getElementById(`study-turn-${turn.id}`);
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - 92;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      setFocusedNodeId(nodeId);
    }
  }

  return {
    focusedNodeId,
    onGraphNodeSelect
  };
}

