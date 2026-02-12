"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Pusher, { Channel } from "pusher-js";
import type {
  CanvasCommand,
  ClearCanvasCommand,
  DrawSegmentCommand,
  RequestSyncEvent,
  SegmentBatchEvent,
  SyncStateEvent,
  ToolMode
} from "@/lib/types";

type Props = {
  roomId: string;
};

type PresenceChannel = Channel & {
  members?: {
    count: number;
  };
  trigger: (eventName: string, data: unknown) => boolean;
};

const MAX_HISTORY = 10000;
const DEFAULT_COLOR = "#111111";
const DEFAULT_SIZE = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function drawCommand(ctx: CanvasRenderingContext2D, command: CanvasCommand, width: number, height: number): void {
  if (command.kind === "clear") {
    ctx.clearRect(0, 0, width, height);
    return;
  }

  const fromX = command.from.x * width;
  const fromY = command.from.y * height;
  const toX = command.to.x * width;
  const toY = command.to.y * height;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = command.mode === "erase" ? "#ffffff" : command.color;
  ctx.lineWidth = command.size;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.restore();
}

function redrawCanvas(canvas: HTMLCanvasElement, history: CanvasCommand[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const command of history) {
    drawCommand(ctx, command, canvas.width, canvas.height);
  }
}

function randomName(): string {
  const options = ["Azure", "Coral", "Jade", "Amber", "Onyx", "Indigo", "Sienna", "Cobalt"];
  const tail = Math.floor(Math.random() * 900 + 100);
  return `${options[Math.floor(Math.random() * options.length)]}-${tail}`;
}

function getUserIdentity(): { id: string; name: string } {
  if (typeof window === "undefined") {
    return { id: "server", name: "server" };
  }

  const existingId = window.localStorage.getItem("paint:user-id");
  const existingName = window.localStorage.getItem("paint:user-name");

  if (existingId && existingName) return { id: existingId, name: existingName };

  const id = crypto.randomUUID();
  const name = randomName();
  window.localStorage.setItem("paint:user-id", id);
  window.localStorage.setItem("paint:user-name", name);
  return { id, name };
}

export default function PaintBoard({ roomId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<CanvasCommand[]>([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const channelRef = useRef<PresenceChannel | null>(null);
  const isSyncedRef = useRef(false);
  const pendingSegmentsRef = useRef<DrawSegmentCommand[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const [{ id: userId, name: userName }] = useState(getUserIdentity);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_SIZE);
  const [toolMode, setToolMode] = useState<ToolMode>("draw");
  const [status, setStatus] = useState("Connecting...");
  const [participants, setParticipants] = useState(1);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/board/${roomId}`;
  }, [roomId]);

  const appendCommand = useCallback((command: CanvasCommand) => {
    const next = historyRef.current.length >= MAX_HISTORY ? historyRef.current.slice(1) : historyRef.current.slice();
    next.push(command);
    historyRef.current = next;
  }, []);

  const emitEvent = useCallback((eventName: string, data: unknown) => {
    const channel = channelRef.current;
    if (!channel) return;
    channel.trigger(eventName, data);
  }, []);

  const flushPendingSegments = useCallback(() => {
    if (!pendingSegmentsRef.current.length) return;
    const batch = pendingSegmentsRef.current;
    pendingSegmentsRef.current = [];
    emitEvent("client-segments", {
      authorId: userId,
      segments: batch
    } satisfies SegmentBatchEvent);
  }, [emitEvent, userId]);

  const applyCommand = useCallback((command: CanvasCommand) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    appendCommand(command);
    drawCommand(ctx, command, canvas.width, canvas.height);
  }, [appendCommand]);

  const clearBoard = useCallback((broadcast: boolean) => {
    const clearCommand: ClearCanvasCommand = {
      kind: "clear",
      authorId: userId,
      ts: Date.now()
    };
    applyCommand(clearCommand);
    if (broadcast) emitEvent("client-clear", clearCommand);
  }, [applyCommand, emitEvent, userId]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = Math.floor(width);
    canvas.height = Math.floor(height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    redrawCanvas(canvas, historyRef.current);
  }, []);

  const getPointFromPointer = useCallback((event: PointerEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;

    return {
      x: clamp(rawX / rect.width, 0, 1),
      y: clamp(rawY / rect.height, 0, 1)
    };
  }, []);

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(() => resizeCanvas());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!pusherKey || !pusherCluster) {
      setStatus("Missing env vars");
      return;
    }

    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
        paramsProvider: () => ({
          userId,
          userName
        })
      }
    });

    const channel = pusher.subscribe(`presence-board-${roomId}`) as PresenceChannel;
    channelRef.current = channel;

    channel.bind("pusher:subscription_succeeded", () => {
      setStatus("Connected");
      setParticipants(channel.members?.count ?? 1);
      if ((channel.members?.count ?? 1) > 1) {
        emitEvent("client-request-sync", { requesterId: userId } satisfies RequestSyncEvent);
      } else {
        isSyncedRef.current = true;
      }
    });

    channel.bind("pusher:member_added", () => {
      setParticipants(channel.members?.count ?? 1);
    });
    channel.bind("pusher:member_removed", () => {
      setParticipants(channel.members?.count ?? 1);
    });

    channel.bind("client-segments", (payload: SegmentBatchEvent) => {
      if (payload.authorId === userId) return;
      for (const command of payload.segments) {
        applyCommand(command);
      }
    });

    channel.bind("client-clear", (command: ClearCanvasCommand) => {
      if (command.authorId === userId) return;
      applyCommand(command);
    });

    channel.bind("client-request-sync", (payload: RequestSyncEvent) => {
      if (payload.requesterId === userId) return;
      if (!historyRef.current.length) return;

      emitEvent("client-sync-state", {
        targetId: payload.requesterId,
        history: historyRef.current
      } satisfies SyncStateEvent);
    });

    channel.bind("client-sync-state", (payload: SyncStateEvent) => {
      if (payload.targetId !== userId) return;
      if (isSyncedRef.current) return;
      historyRef.current = payload.history.slice(-MAX_HISTORY);
      const canvas = canvasRef.current;
      if (canvas) redrawCanvas(canvas, historyRef.current);
      isSyncedRef.current = true;
    });

    pusher.connection.bind("error", () => {
      setStatus("Connection error");
    });

    return () => {
      if (flushTimerRef.current) {
        window.clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushPendingSegments();
      pusher.unsubscribe(`presence-board-${roomId}`);
      pusher.disconnect();
      channelRef.current = null;
    };
  }, [applyCommand, emitEvent, flushPendingSegments, roomId, userId, userName]);

  useEffect(() => {
    // Keep event rate below provider limits by batching segments.
    flushTimerRef.current = window.setInterval(() => {
      flushPendingSegments();
    }, 120);

    return () => {
      if (flushTimerRef.current) {
        window.clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [flushPendingSegments]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = getPointFromPointer(event);
      if (!point) return;
      drawingRef.current = true;
      lastPointRef.current = point;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drawingRef.current) return;
      const nextPoint = getPointFromPointer(event);
      const prevPoint = lastPointRef.current;
      if (!nextPoint || !prevPoint) return;

      const command: DrawSegmentCommand = {
        kind: "segment",
        from: prevPoint,
        to: nextPoint,
        color,
        size: brushSize,
        mode: toolMode,
        authorId: userId,
        ts: Date.now()
      };
      applyCommand(command);
      pendingSegmentsRef.current.push(command);

      lastPointRef.current = nextPoint;
    };

    const onPointerUp = (event: PointerEvent) => {
      drawingRef.current = false;
      lastPointRef.current = null;
      flushPendingSegments();
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
    };
  }, [applyCommand, brushSize, color, flushPendingSegments, getPointFromPointer, toolMode, userId]);

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setStatus("Link copied");
    window.setTimeout(() => setStatus("Connected"), 1200);
  };

  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `board-${roomId}.png`;
    link.click();
  };

  return (
    <main className="board-page">
      <header className="board-header">
        <div className="title-area">
          <h1>Room: {roomId}</h1>
          <p>
            User: {userName} | Online: {participants} | {status}
          </p>
        </div>
        <div className="header-actions">
          <button onClick={handleCopyLink} type="button">
            Copy Invite Link
          </button>
          <Link href="/">Change Room</Link>
        </div>
      </header>

      <section className="toolbar">
        <div className="tool-group">
          <label htmlFor="brushColor">Color</label>
          <input id="brushColor" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>

        <div className="tool-group">
          <label htmlFor="brushSize">Brush {brushSize}px</label>
          <input
            id="brushSize"
            type="range"
            min={1}
            max={24}
            step={1}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
        </div>

        <div className="tool-group mode-buttons">
          <button
            type="button"
            className={toolMode === "draw" ? "active" : ""}
            onClick={() => setToolMode("draw")}
          >
            Brush
          </button>
          <button
            type="button"
            className={toolMode === "erase" ? "active" : ""}
            onClick={() => setToolMode("erase")}
          >
            Eraser
          </button>
        </div>

        <div className="tool-group mode-buttons">
          <button type="button" onClick={() => clearBoard(true)}>
            Clear Board
          </button>
          <button type="button" onClick={handleDownloadPng}>
            Export PNG
          </button>
        </div>
      </section>

      <section ref={containerRef} className="canvas-container">
        <canvas ref={canvasRef} />
      </section>
    </main>
  );
}
