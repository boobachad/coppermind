import { Keyboard, type KeyboardInteractionEvent } from "@/components/ui/keyboard";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function KeyboardTestPage() {
  const navigate = useNavigate();
  const [lastEvent, setLastEvent] = useState<KeyboardInteractionEvent | null>(null);

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-6xl mx-auto p-6">
        <button
          onClick={() => navigate('/experimental')}
          className="mb-6 flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          style={{ 
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)'
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Experimental
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Interactive Keyboard
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Test keyboard component with haptics and sound
          </p>
        </div>

        <div 
          className="p-6 rounded-lg mb-6"
          style={{ 
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)'
          }}
        >
          <div className="flex justify-center mb-4">
            <Keyboard
              theme="classic"
              enableHaptics
              enableSound
              onKeyEvent={(event) => setLastEvent(event)}
            />
          </div>

          {lastEvent && (
            <div 
              className="p-4 rounded text-sm font-mono"
              style={{ 
                background: 'var(--surface-secondary)',
                color: 'var(--text-secondary)'
              }}
            >
              <div>Code: {lastEvent.code}</div>
              <div>Phase: {lastEvent.phase}</div>
              <div>Source: {lastEvent.source}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
