export type Point = {
  x: number;
  y: number;
};

export type ToolMode = "draw" | "erase";

export type DrawSegmentCommand = {
  kind: "segment";
  from: Point;
  to: Point;
  color: string;
  size: number;
  mode: ToolMode;
  authorId: string;
  ts: number;
};

export type ClearCanvasCommand = {
  kind: "clear";
  authorId: string;
  ts: number;
};

export type CanvasCommand = DrawSegmentCommand | ClearCanvasCommand;

export type SyncStateEvent = {
  targetId: string;
  history: CanvasCommand[];
};

export type RequestSyncEvent = {
  requesterId: string;
};
