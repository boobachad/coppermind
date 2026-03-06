import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { FloatingNavBar } from './FloatingNavBar';
import { TitleBar } from './TitleBar';
import { useEffect, useState } from 'react';
import { FocusWidget } from '../pos/components/FocusWidget';
import { Menu, X } from 'lucide-react';

export function Layout() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 750);
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    const saved = localStorage.getItem('sidebar-visible');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 750);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-visible', String(sidebarVisible));
  }, [sidebarVisible]);

  const toggleSidebar = () => setSidebarVisible(prev => !prev);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden material-base font-sans selection:bg-white/20 selection:text-white">
      {/* Custom Title Bar (Mac-style inset) */}
      <TitleBar />

      {/* Main Content Area - Split Pane "Islands" */}
      <div className="flex flex-1 overflow-hidden relative p-3 gap-3">
        {!isMobile && sidebarVisible && (
          <aside className="w-64 flex flex-col h-full rounded-2xl material-sidebar overflow-hidden shadow-2xl relative z-20 transition-all duration-300">
            <Sidebar />
          </aside>
        )}

        {!isMobile && (
          <button
            onClick={toggleSidebar}
            className="fixed top-16 z-30 p-2 rounded-lg shadow-lg transition-all duration-300 hover:scale-110"
            style={{
              left: sidebarVisible ? '16.5rem' : '1rem',
              backgroundColor: 'var(--glass-bg)',
              borderColor: 'var(--glass-border)',
              color: 'var(--text-primary)',
              border: '1px solid'
            }}
            title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
          >
            {sidebarVisible ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        )}

        <main className="flex-1 rounded-2xl material-glass overflow-hidden relative h-full shadow-2xl z-10 flex flex-col">
          <Outlet />
        </main>

        {isMobile && <FloatingNavBar />}
      </div>

      {/* Global Focus Timer Widget */}
      <FocusWidget />
    </div>
  );
}
