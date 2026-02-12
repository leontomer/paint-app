import PaintBoard from "@/components/PaintBoard";

export default function BoardPage({ params }: { params: { roomId: string } }) {
  return <PaintBoard roomId={params.roomId} />;
}
