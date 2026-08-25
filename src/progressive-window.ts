export type MessageWindow = { start: number; end: number };
export type WindowDirection = "before" | "after";

export const shiftMessageWindow = (
  current: MessageWindow,
  length: number,
  direction: WindowDirection,
  step: number,
  limit: number,
): MessageWindow => {
  if (direction === "after") {
    const end = Math.min(length, current.end + step);
    return { start: Math.max(0, end - limit), end };
  }
  const start = Math.max(0, current.start - step);
  return { start, end: Math.min(length, start + limit) };
};

export const sameMessageWindow = (a: MessageWindow, b: MessageWindow) =>
  a.start === b.start && a.end === b.end;

export const scrollAnchorDelta = (before: number, after: number) => after - before;
