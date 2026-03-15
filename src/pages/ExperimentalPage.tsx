import { useNavigate } from 'react-router-dom';
import { Keyboard } from 'lucide-react';

export function ExperimentalPage() {
  const navigate = useNavigate();

  const features = [
    {
      id: 'keyboard',
      name: 'Interactive Keyboard',
      description: 'Test keyboard component with haptics and sound',
      path: '/experimental/keyboard'
    }
  ];

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Experimental Features
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Testing ground for new components and features
          </p>
        </div>

        <div className="grid gap-4">
          {features.map((feature) => (
            <button
              key={feature.id}
              onClick={() => navigate(feature.path)}
              className="p-6 rounded-lg text-left transition-all hover:scale-[1.02]"
              style={{ 
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)'
              }}
            >
              <div className="flex items-start gap-4">
                <div 
                  className="p-3 rounded-lg"
                  style={{ background: 'var(--surface-secondary)' }}
                >
                  <Keyboard className="w-6 h-6" style={{ color: 'var(--text-primary)' }} />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {feature.name}
                  </h2>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {feature.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
