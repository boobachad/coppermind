import { Tldraw } from 'tldraw';
import { useTheme } from '../../lib/ThemeContext';
import 'tldraw/tldraw.css';
import './styles/whiteboard.css';

export function WhiteboardPage() {
  const { theme } = useTheme();
  // Apply theme class to container for CSS targeting
  const themeClass = theme === 'dark' ? 'tldraw-dark' : 'tldraw-light';

  return (
    <div className={`h-full relative flex flex-col bg-transparent whiteboard-container ${themeClass}`}>
      <div className="flex-1 overflow-hidden relative">
        <Tldraw />
      </div>
    </div>
  );
}
