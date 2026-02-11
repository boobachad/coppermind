import { useState, useRef, useCallback } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';

interface ImageUploaderProps {
  initialImageUrl: string;
  onImageChange: (base64: string) => void;
  isLocked?: boolean;
}

export default function ImageUploader({ initialImageUrl, onImageChange, isLocked }: ImageUploaderProps) {
  const [preview, setPreview] = useState<string>(initialImageUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onImageChange]);

  const handleRemove = useCallback(() => {
    setPreview('');
    onImageChange('');
  }, [onImageChange]);

  if (isLocked) {
    return preview ? (
      <div className="relative border rounded-lg overflow-hidden h-[300px] w-full" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
        <img src={preview} alt="Schedule" className="object-contain w-full h-full p-4" />
      </div>
    ) : (
      <div className="flex items-center justify-center h-[300px] w-full border rounded-lg" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
        No image
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

      {preview ? (
        <div className="space-y-4">
          <div className="relative border rounded-lg overflow-hidden h-[300px] w-full" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <img src={preview} alt="Schedule" className="object-contain w-full h-full p-4" />
            <button
              onClick={handleRemove}
              className="absolute top-3 right-3 p-2 rounded-md"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', border: '1px solid' }}
            >
              <X className="h-4 w-4" style={{ color: 'var(--text-primary)' }} />
            </button>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2 px-4 rounded-md border flex items-center justify-center"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          >
            <Upload className="mr-2 h-4 w-4" />
            Replace Image
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-lg py-10 flex flex-col items-center gap-3 cursor-pointer"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>PNG, JPG up to 5MB</p>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Click to upload</p>
        </div>
      )}
    </div>
  );
}
