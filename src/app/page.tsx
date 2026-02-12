"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export default function HomePage() {
  const router = useRouter();
  const [roomInput, setRoomInput] = useState("");
  const [suggested, setSuggested] = useState("");

  useEffect(() => {
    setSuggested(generateRoomId());
  }, []);

  const goToRoom = (roomId: string) => {
    const normalized = roomId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!normalized) return;
    router.push(`/board/${normalized}`);
  };

  const handleJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    goToRoom(roomInput);
  };

  return (
    <main className="home">
      <section className="home-card">
        <p className="eyebrow">Painting board</p>
        <h1>Realtime Collaborative Paint</h1>
        <p className="subtitle">
          Share a room link and draw together. Up to 10 users can paint simultaneously on the same board.
        </p>

        <div className="home-actions">
          <button className="primary" onClick={() => goToRoom(suggested)} type="button">
            Start New Room: {suggested || "......"}
          </button>

          <form onSubmit={handleJoin} className="join-form">
            <input
              placeholder="Enter room id"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              aria-label="Room ID"
            />
            <button type="submit">Join Room</button>
          </form>
        </div>
      </section>
    </main>
  );
}
