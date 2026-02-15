import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { FloatingNavBar } from './FloatingNavBar';
import { TitleBar } from './TitleBar';
import { useEffect, useState } from 'react';

export function Layout() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 750);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 750);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden material-base font-sans selection:bg-white/20 selection:text-white">
      {/* Custom Title Bar (Mac-style inset) */}
      <TitleBar />

      {/* Main Content Area - Split Pane "Islands" */}
      <div className="flex flex-1 overflow-hidden relative p-3 gap-3">
        {!isMobile && (
          <aside className="w-64 flex flex-col h-full rounded-2xl material-sidebar overflow-hidden shadow-2xl relative z-20">
            <Sidebar />
          </aside>
        )}

        <main className="flex-1 rounded-2xl material-glass overflow-hidden relative h-full shadow-2xl z-10 flex flex-col">
          <Outlet />
        </main>

        {isMobile && <FloatingNavBar />}
      </div>
    </div>
  );
}
