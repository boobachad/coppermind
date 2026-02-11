import { useState, useRef, useEffect } from 'react';
import { Upload, X, Edit3 } from 'lucide-react';
import { toast } from 'sonner';
import { NapchartData } from '../types';
import NapchartModal from './NapchartModal';
import { Button } from '@/components/ui/button';

declare global {
  interface Window {
    Napchart: any;
  }
}

interface ScheduleViewerProps {
  scheduleData: NapchartData | null;
  imageUrl: string;
  onScheduleChange: (data: NapchartData) => void;
  onImageChange: (base64: string) => void;
  isLocked?: boolean;
  title: string;
}

export default function ScheduleViewer({
  scheduleData,
  imageUrl,
  onScheduleChange,
  onImageChange,
  isLocked,
  title,
}: ScheduleViewerProps) {
  const [mode, setMode] = useState<'image' | 'editor'>(scheduleData ? 'editor' : 'image');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [preview, setPreview] = useState<string>(imageUrl);
  const [renderedChart, setRenderedChart] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render napchart to canvas when data changes
  useEffect(() => {
    if (scheduleData && canvasRef.current && window.Napchart) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      try {
        window.Napchart.init(ctx, scheduleData, {
          interaction: false,
          penMode: false,
          background: 'transparent',
          fontColor: '#666',
        });

        // Convert canvas to base64
        setTimeout(() => {
          const dataUrl = canvasRef.current!.toDataURL('image/png');
          setRenderedChart(dataUrl);
        }, 100);
      } catch (error) {
        console.error('Failed to render napchart:', error);
      }
    }
  }, [scheduleData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file type');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large (max 5MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPreview(base64);
      onImageChange(base64);
      setMode('image');
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = () => {
    setPreview('');
    onImageChange('');
  };

  const handleSaveSchedule = (data: NapchartData) => {
    onScheduleChange(data);
    setMode('editor');
  };

  const displayContent = mode === 'editor' && renderedChart ? renderedChart : preview;

  if (isLocked) {
    return displayContent ? (
      <div className="relative border rounded-lg overflow-hidden h-[300px] w-full" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
        <img src={displayContent} alt="Schedule" className="object-contain w-full h-full p-4" />
      </div>
    ) : (
      <div className="flex items-center justify-center h-[300px] w-full border rounded-lg" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
        No schedule
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {displayContent ? (
        <div className="space-y-4">
          <div className="relative border rounded-lg overflow-hidden h-[300px] w-full" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <img src={displayContent} alt="Schedule" className="object-contain w-full h-full p-4" />
            {mode === 'image' && (
              <button
                onClick={handleRemoveImage}
                className="absolute top-3 right-3 p-2 rounded-md"
                style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', border: '1px solid' }}
              >
                <X className="h-4 w-4" style={{ color: 'var(--text-primary)' }} />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {mode === 'editor' && (
              <Button
                onClick={() => setIsModalOpen(true)}
                variant="outline"
                className="flex-1 flex items-center justify-center gap-2 h-10"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)'
                }}
              >
                <Edit3 className="h-4 w-4" />
                Edit Schedule
              </Button>
            )}
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="flex-1 flex items-center justify-center gap-2 h-10"
              style={{ 
                backgroundColor: 'var(--btn-primary-bg)', 
                color: 'var(--btn-primary-text)'
              }}
            >
              <Upload className="h-4 w-4" />
              {mode === 'image' ? 'Replace Image' : 'Upload Image Instead'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg py-10 flex flex-col items-center gap-3 cursor-pointer"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>PNG, JPG up to 5MB</p>
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Click to upload image</p>
          </div>
          <div className="text-center">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>or</span>
          </div>
          <Button
            onClick={() => setIsModalOpen(true)}
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)'
            }}
          >
            <Edit3 className="h-4 w-4" />
            Create with Editor
          </Button>
        </div>
      )}

      {/* Hidden canvas for rendering */}
      <canvas ref={canvasRef} width={600} height={600} className="hidden" />

      <NapchartModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        data={scheduleData}
        onSave={handleSaveSchedule}
        title={title}
      />
    </div>
  );
}
