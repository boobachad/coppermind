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
    <div className="flex flex-col h-full bg-gray-50 dark:bg-dark-bgSecondary text-gray-900 dark:text-dark-text-primary overflow-hidden">
      {/* Custom Title Bar */}
      <TitleBar />
      
      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative pt-[0px]"> 
        {!isMobile && <Sidebar />}
        <main className={`flex-1 overflow-auto h-full relative bg-gray-50 dark:bg-dark-bg ${!isMobile ? 'rounded-tl-2xl rounded-bl-2xl shadow-[-10px_0_30px_rgba(0,0,0,0.08)]' : ''}`}>
          <Outlet />
        </main>
        {isMobile && <FloatingNavBar />}
      </div>
    </div>
  );
}
