import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import './styles/whiteboard.css';

export function WhiteboardPage() {
  return (
    <div className="h-full relative flex flex-col bg-transparent whiteboard-container">
      <div className="flex-1 overflow-hidden relative">
        <Tldraw />
      </div>
    </div>
  );
}
