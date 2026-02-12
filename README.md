# Realtime Collaborative Paint App

Multiplayer paint board built with Next.js + TypeScript + Pusher Channels.

## Features

- Real-time collaborative drawing (optimized for up to 10 concurrent users per room)
- Multiple independent rooms (`/board/{roomId}`)
- Sync-on-join so new participants can receive the active canvas state
- Brush and eraser tools
- Color picker and brush size control
- Clear board (shared) and PNG export
- Responsive UI for desktop and mobile

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Pusher Channels (presence + client events)
