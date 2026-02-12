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

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill Pusher credentials:

```bash
cp .env.example .env.local
```

3. Run development server:

```bash
npm run dev
```

4. Open `http://localhost:3000`

## Pusher Setup Notes

In your Pusher Channels app settings:

- Enable client events
- Use a cluster that matches `NEXT_PUBLIC_PUSHER_CLUSTER`
- Presence channel is used per room: `presence-board-{roomId}`

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add environment variables from `.env.example`.
4. Deploy.

No custom WebSocket server is needed because realtime is handled by Pusher.
