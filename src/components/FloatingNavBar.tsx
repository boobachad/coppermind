import { NavLink } from 'react-router-dom';
import { FileText, CheckSquare, Share2 } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState, useRef } from 'react';

export function FloatingNavBar() {
  const [isVisible, setIsVisible] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      // Show immediately on scroll
      setIsVisible(true);
      
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Check if at top or bottom
      const isAtTop = window.scrollY < 50;
      const isAtBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 50;

      if (!isAtTop && !isAtBottom) {
        // Hide after 2 seconds if not at ends
        timeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 2000);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className={clsx(
      "fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-500",
      isVisible ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0"
    )}>
      <div className="flex items-center bg-white/80 backdrop-blur-md border border-gray-200 shadow-lg rounded-full px-4 py-2 space-x-6">
        <NavLink
          to="/"
          end
          className={({ isActive }) => clsx("flex flex-col items-center p-2 rounded-lg transition-colors", isActive ? "text-blue-600" : "text-gray-500 hover:text-gray-900")}
        >
          <FileText className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium">Notes</span>
        </NavLink>
        
        <NavLink
          to="/todos"
          className={({ isActive }) => clsx("flex flex-col items-center p-2 rounded-lg transition-colors", isActive ? "text-blue-600" : "text-gray-500 hover:text-gray-900")}
        >
          <CheckSquare className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium">To-Dos</span>
        </NavLink>

        <NavLink
          to="/nodes"
          className={({ isActive }) => clsx("flex flex-col items-center p-2 rounded-lg transition-colors", isActive ? "text-blue-600" : "text-gray-500 hover:text-gray-900")}
        >
          <Share2 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium">Nodes</span>
        </NavLink>
      </div>
    </div>
  );
}
