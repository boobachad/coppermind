import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { NapchartData } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

declare global {
  interface Window {
    Napchart: any;
  }
}

interface NapchartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: NapchartData | null;
  onSave: (data: NapchartData) => void;
  title: string;
}

const COLORS = [
  { value: 'red', hex: '#D02516' },
  { value: 'blue', hex: '#4285F4' },
  { value: 'brown', hex: '#B15911' },
  { value: 'green', hex: '#34A853' },
  { value: 'gray', hex: '#949494' },
  { value: 'yellow', hex: '#FBBC05' },
  { value: 'purple', hex: '#730B73' },
  { value: 'pink', hex: '#ff94d4' },
];

export default function NapchartModal({ isOpen, onClose, data, onSave, title }: NapchartModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentColor, setCurrentColor] = useState('red');
  const [currentShape, setCurrentShape] = useState<'circle' | 'wide' | 'line'>('circle');
  const [lanes, setLanes] = useState(1);
  const [selectedElement, setSelectedElement] = useState<number | false>(false);
  const [elementText, setElementText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.Napchart) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = '/napchart.min.js';
    script.async = true;
    script.onload = () => setIsLoaded(true);
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !isLoaded || !canvasRef.current || !window.Napchart) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const defaultData: NapchartData = data || {
      elements: [],
      shape: currentShape,
      lanes: lanes,
    };

    setCurrentShape(defaultData.shape);
    setLanes(defaultData.lanes);

    const getThemeColor = () => {
      // Check computed style on html to catch 'dark' class variables safely
      const style = getComputedStyle(document.documentElement);
      // Canvas drawing APIs cannot resolve CSS variable strings — resolve to actual value
      const color = style.getPropertyValue('--text-primary').trim();
      return color || '#1a1a1f';
    };

    try {
      chartRef.current = window.Napchart.init(ctx, defaultData, {
        interaction: true,
        penMode: true,
        background: 'transparent',
        fontColor: getThemeColor(),
        defaultColor: currentColor,
      });

      chartRef.current.onSetSelected = (id: number | false) => {
        setSelectedElement(id);
        if (id !== false) {
          const element = chartRef.current.data.elements.find((e: any) => e.id === id);
          if (element) {
            setElementText(element.text || '');
            setTimeout(() => inputRef.current?.focus(), 0);
          }
          chartRef.current.penMode = false;
          chartRef.current.interaction = true;
        } else {
          setElementText('');
          chartRef.current.penMode = true;
        }
      };

      chartRef.current.onUpdate = () => {
        if (!chartRef.current) return;
        if (selectedElement !== false) {
          const element = chartRef.current.data.elements.find((e: any) => e.id === selectedElement);
          if (element && element.text !== elementText) {
            setElementText(element.text || '');
          }
        }
      };
    } catch (error) {
      console.error('Failed to initialize napchart:', error);
    }

    const observer = new MutationObserver(() => {
      if (chartRef.current) {
        const newColor = getThemeColor();
        // Try updating multiple config paths to be safe
        if (chartRef.current.config) chartRef.current.config.fontColor = newColor;
        if (chartRef.current.data) chartRef.current.data.fontColor = newColor;
        chartRef.current.draw();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

    return () => {
      observer.disconnect();
      if (chartRef.current) {
        chartRef.current.onSetSelected = null;
        chartRef.current.onUpdate = null;
        chartRef.current = null;
      }
    };
  }, [isOpen, isLoaded]);

  useEffect(() => {
    if (chartRef.current) {
      if (chartRef.current.unScaledConfig) {
        chartRef.current.unScaledConfig.defaultColor = currentColor;
      }
      if (chartRef.current.config) {
        chartRef.current.config.defaultColor = currentColor;
      }
    }
  }, [currentColor]);

  const handleShapeChange = (shape: 'circle' | 'wide' | 'line') => {
    if (chartRef.current) {
      chartRef.current.changeShape(shape);
      setCurrentShape(shape);
    }
  };

  const handleAddLane = () => {
    if (chartRef.current && lanes < 4) {
      chartRef.current.addLane();
      setLanes(lanes + 1);
    }
  };

  const handleRemoveLane = () => {
    if (chartRef.current && lanes > 1) {
      chartRef.current.deleteLane(lanes - 1);
      setLanes(lanes - 1);
    }
  };

  const handleTextChange = (text: string) => {
    setElementText(text);
    if (selectedElement !== false && chartRef.current) {
      chartRef.current.updateElement({ id: selectedElement, text });
      chartRef.current.draw();
    }
  };

  const handleSave = () => {
    if (chartRef.current) {
      const napchartData: NapchartData = {
        elements: chartRef.current.data.elements,
        shape: chartRef.current.data.shape,
        lanes: chartRef.current.data.lanes,
        colorTags: chartRef.current.data.colorTags,
      };
      onSave(napchartData);
      onClose();
    }
  };

  if (!isOpen) return null;

  // Standard button styles using theme variables
  const btnActive = "bg-primary text-primary-foreground font-bold shadow-sm";
  const btnInactive = "bg-secondary text-secondary-foreground hover:bg-secondary/80";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[95vw] h-[95vh] rounded-xl flex material-glass overflow-hidden border border-(--glass-border)">
        {/* Left Sidebar */}
        <div className="w-48 border-r p-4 space-y-6 overflow-y-auto" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Shape:</h3>
            <div className="space-y-1">
              <button
                onClick={() => handleShapeChange('circle')}
                className={`w-full px-3 py-1.5 text-sm rounded transition-all ${currentShape === 'circle' ? btnActive : btnInactive}`}
              >
                circle
              </button>
              <button
                onClick={() => handleShapeChange('wide')}
                className={`w-full px-3 py-1.5 text-sm rounded transition-all ${currentShape === 'wide' ? btnActive : btnInactive}`}
              >
                wide
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Lanes:</h3>
            <div className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{lanes} lane{lanes > 1 ? 's' : ''}</div>
            <div className="space-y-2">
              <button
                onClick={handleAddLane}
                disabled={lanes >= 4}
                className={`w-full px-3 py-1.5 text-sm rounded transition-colors ${lanes >= 4 ? 'opacity-50 cursor-not-allowed' : ''} ${btnInactive}`}
              >
                Add lane
              </button>
              <button
                onClick={handleRemoveLane}
                disabled={lanes <= 1}
                className={`w-full px-3 py-1.5 text-sm rounded transition-colors ${lanes <= 1 ? 'opacity-50 cursor-not-allowed' : ''} ${btnInactive}`}
              >
                Delete lane
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Color:</h3>
            <div className="grid grid-cols-4 gap-1">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setCurrentColor(color.value)}
                  className={`w-8 h-8 rounded-full border-2 ${currentColor === color.value ? 'ring-2 ring-offset-1 ring-foreground' : ''}`}
                  style={{
                    backgroundColor: color.hex,
                    borderColor: currentColor === color.value ? 'var(--text-primary)' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          {selectedElement !== false && (
            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Label:</h3>
              <Input
                ref={inputRef}
                value={elementText}
                onChange={(e) => handleTextChange(e.target.value)}
                onFocus={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Activity name..."
                className="text-sm"
                autoComplete="off"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Selected segment
              </p>
            </div>
          )}
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            <div className="flex items-center gap-2">
              <Button onClick={handleSave} variant="default" className="font-medium">Save</Button>
              <button onClick={onClose} className="p-2 rounded hover:bg-white/10 transition-colors">
                <X className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-8">
            {isLoaded ? (
              <canvas ref={canvasRef} width={800} height={800} className="max-w-full max-h-full" />
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>Loading editor...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
