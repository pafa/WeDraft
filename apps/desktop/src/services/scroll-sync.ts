type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export type ContentAnchor = {
  blockIndex: number;
  progress: number;
};

export type ContentBox = {
  blockIndex: number;
  top: number;
  height: number;
};

export type ContentSyncEvent = {
  anchor: ContentAnchor;
  origin: "editor" | "preview";
  revision: number;
};

const VIEWPORT_FOCUS = 0.35;

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function contentAnchorFromScroll(
  scrollTop: number,
  clientHeight: number,
  boxes: ContentBox[],
): ContentAnchor | null {
  if (!boxes.length) return null;
  const ordered = [...boxes].sort((left, right) => left.top - right.top);
  const focus = scrollTop + clientHeight * VIEWPORT_FOCUS;
  const first = ordered[0]!;
  if (focus <= first.top) {
    return { blockIndex: first.blockIndex, progress: 0 };
  }
  for (let index = 0; index < ordered.length; index += 1) {
    const box = ordered[index]!;
    const bottom = box.top + Math.max(1, box.height);
    if (focus <= bottom) {
      return {
        blockIndex: box.blockIndex,
        progress: clampProgress((focus - box.top) / Math.max(1, box.height)),
      };
    }
    const next = ordered[index + 1];
    if (next && focus < next.top) {
      return focus - bottom <= next.top - focus
        ? { blockIndex: box.blockIndex, progress: 1 }
        : { blockIndex: next.blockIndex, progress: 0 };
    }
  }
  const last = ordered.at(-1)!;
  return { blockIndex: last.blockIndex, progress: 1 };
}

export function scrollTopForContentAnchor(
  anchor: ContentAnchor,
  clientHeight: number,
  boxes: ContentBox[],
): number | null {
  const box = boxes.find(
    (candidate) => candidate.blockIndex === anchor.blockIndex,
  );
  if (!box) return null;
  return Math.max(
    0,
    box.top +
      Math.max(1, box.height) * clampProgress(anchor.progress) -
      clientHeight * VIEWPORT_FOCUS,
  );
}

export function blockIndexAtSourceLine(
  line: number,
  ranges: Array<{
    blockIndex: number;
    startLine: number;
    endLine: number;
  }>,
): number | null {
  const containing = ranges.find(
    (range) => line >= range.startLine && line <= range.endLine,
  );
  if (containing) return containing.blockIndex;
  const nearest = ranges
    .map((range) => ({
      blockIndex: range.blockIndex,
      distance:
        line < range.startLine
          ? range.startLine - line
          : line - range.endLine,
    }))
    .sort((left, right) => left.distance - right.distance)[0];
  return nearest?.blockIndex ?? null;
}

export function scrollRatio({
  scrollTop,
  scrollHeight,
  clientHeight,
}: ScrollMetrics): number {
  const maximum = Math.max(0, scrollHeight - clientHeight);
  if (maximum === 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / maximum));
}

export function scrollTopAtRatio(
  ratio: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const maximum = Math.max(0, scrollHeight - clientHeight);
  return maximum * Math.min(1, Math.max(0, ratio));
}

export function applyScrollRatio(
  element: HTMLElement,
  ratio: number,
): void {
  const nextTop = scrollTopAtRatio(
    ratio,
    element.scrollHeight,
    element.clientHeight,
  );
  if (Math.abs(element.scrollTop - nextTop) > 1) {
    element.scrollTop = nextTop;
  }
}
