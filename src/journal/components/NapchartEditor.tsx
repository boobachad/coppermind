import { useEffect, useRef, useState } from 'react';
import { NapchartData } from '../types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

// Load napchart from bundled minified version
declare global {
  interface Window {
    Napchart: any;
  }
}

interface NapchartEditorProps {
  data: NapchartData | null;
  onChange: (data: NapchartData) => void;
  readOnly?: boolean;
}

const COLORS = [
  { name: 'Red', value: 'red', hex: '#D02516' },
  { name: 'Blue', value: 'blue', hex: '#4285F4' },
  { name: 'Green', value: 'green', hex: '#34A853' },
  { name: 'Yellow', value: 'yellow', hex: '#FBBC05' },
  { name: 'Purple', value: 'purple', hex: '#730B73' },
  { name: 'Pink', value: 'pink', hex: '#ff94d4' },
  { name: 'Brown', value: 'brown', hex: '#B15911' },
  { name: 'Gray', value: 'gray', hex: '#949494' },
];

export default function NapchartEditor({ data, onChange, readOnly }: NapchartEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedElement, setSelectedElement] = useState<number | false>(false);
  const [elementText, setElementText] = useState('');
  const [currentColor, setCurrentColor] = useState('red');

  // Load napchart library
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

  // Initialize napchart
  useEffect(() => {
    if (!isLoaded || !canvasRef.current || !window.Napchart) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const defaultData: NapchartData = data || {
      elements: [],
      shape: 'circle',
      lanes: 1,
    };

    try {
      chartRef.current = window.Napchart.init(ctx, defaultData, {
        interaction: !readOnly,
        penMode: !readOnly,
        background: 'transparent',
        fontColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--text-primary')
          .trim() || '#aaaaaa',
        defaultColor: currentColor,
      });

      // Listen for updates
      if (!readOnly && chartRef.current) {
        chartRef.current.onUpdate = () => {
          const updatedData: NapchartData = {
            elements: chartRef.current.data.elements,
            shape: chartRef.current.data.shape,
            lanes: chartRef.current.data.lanes,
            colorTags: chartRef.current.data.colorTags,
          };
          onChange(updatedData);
        };

        // Listen for element selection
        chartRef.current.onSetSelected = (id: number | false) => {
          setSelectedElement(id);
          if (id !== false) {
            const element = chartRef.current.data.elements.find((e: any) => e.id === id);
            if (element) {
              setElementText(element.text || '');
            }
          } else {
            setElementText('');
          }
        };
      }
    } catch (error) {
      console.error('Failed to initialize napchart:', error);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current = null;
      }
    };
  }, [isLoaded, readOnly, data]);

  // Update default color when changed
  useEffect(() => {
    if (chartRef.current) {
      // Update both scaled and unscaled config
      if (chartRef.current.unScaledConfig) {
        chartRef.current.unScaledConfig.defaultColor = currentColor;
      }
      if (chartRef.current.config) {
        chartRef.current.config.defaultColor = currentColor;
      }
      // Force redraw to show pen color
      if (chartRef.current.draw) {
        chartRef.current.draw();
      }
    }
  }, [currentColor]);

  // Handle resize
  useEffect(() => {
    if (!chartRef.current || !containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current) {
        chartRef.current.updateDimensions();
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [isLoaded]);

  const handleTextChange = (text: string) => {
    setElementText(text);
    if (selectedElement !== false && chartRef.current) {
      chartRef.current.updateElement({ id: selectedElement, text });
    }
  };

  const handleColorChange = (color: string) => {
    if (selectedElement !== false && chartRef.current) {
      chartRef.current.changeColor(selectedElement, color);
    }
  };

  const handleDeleteElement = () => {
    if (selectedElement !== false && chartRef.current) {
      chartRef.current.deleteElement(selectedElement);
      setSelectedElement(false);
      setElementText('');
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[400px]" style={{ color: 'var(--text-secondary)' }}>
        Loading editor...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="p-4 rounded-lg border space-y-3" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
          <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Drawing Color
          </h4>
          <div className="grid grid-cols-4 gap-2">
            {COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setCurrentColor(color.value)}
                className={`px-3 py-2 rounded border-2 text-sm font-medium transition-all ${
                  currentColor === color.value ? 'ring-2 ring-offset-1' : ''
                }`}
                style={{
                  backgroundColor: color.hex,
                  borderColor: currentColor === color.value ? 'var(--text-primary)' : 'transparent',
                  color: ['yellow'].includes(color.value) ? 'var(--color-pure-black)' : 'var(--color-pure-white)',
                }}
              >
                {color.name}
              </button>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Select a color, then click and drag on the chart to create time blocks
          </p>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative w-full h-[400px] rounded-lg border"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
        }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: 'block' }}
        />
      </div>

      {!readOnly && selectedElement !== false && (
        <div className="p-4 rounded-lg border space-y-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Edit Selected Block</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteElement}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Label
            </label>
            <Input
              value={elementText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Enter activity name..."
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Change Color
            </label>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleColorChange(color.value)}
                  className="px-3 py-2 rounded border text-sm font-medium transition-all hover:ring-2 hover:ring-offset-1"
                  style={{
                    backgroundColor: color.hex,
                    borderColor: 'var(--border-color)',
                    color: ['yellow'].includes(color.value) ? 'var(--color-pure-black)' : 'var(--color-pure-white)',
                  }}
                >
                  {color.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
