import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FocusWidget } from './pos/components/FocusWidget';
import './index.css';

// Standalone widget entry — only FocusWidget, no router, no SQLite, no sync services.
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="w-full h-screen flex items-center justify-center">
            <FocusWidget alwaysExpanded />
        </div>
    </StrictMode>
);
