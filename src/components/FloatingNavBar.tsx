import { NavLink } from 'react-router-dom';
import { FileText, CheckSquare, Share2, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState, useRef } from 'react';

export function FloatingNavBar() {
  const [isVisible, setIsVisible] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      const isAtTop = window.scrollY < 50;
      const isAtBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 50;

      if (!isAtTop && !isAtBottom) {
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
      <div className="flex items-center material-glass-subtle rounded-full px-5 py-2 space-x-6">
        <NavLink
          to="/"
          end
          className={({ isActive }) => clsx("flex flex-col items-center p-2 rounded-lg transition-all group", isActive ? "text-white bg-white/10 shadow-sm" : "text-white/50 hover:text-white hover:bg-white/5")}
        >
          <FileText className="w-5 h-5 mb-0.5 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium">Notes</span>
        </NavLink>

        <NavLink
          to="/todos"
          className={({ isActive }) => clsx("flex flex-col items-center p-2 rounded-lg transition-all group", isActive ? "text-white bg-white/10 shadow-sm" : "text-white/50 hover:text-white hover:bg-white/5")}
        >
          <CheckSquare className="w-5 h-5 mb-0.5 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium">To-Dos</span>
        </NavLink>

        <NavLink
          to="/nodes"
          className={({ isActive }) => clsx("flex flex-col items-center p-2 rounded-lg transition-all group", isActive ? "text-white bg-white/10 shadow-sm" : "text-white/50 hover:text-white hover:bg-white/5")}
        >
          <Share2 className="w-5 h-5 mb-0.5 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium">Nodes</span>
        </NavLink>

        <NavLink
          to="/journal"
          className={({ isActive }) => clsx("flex flex-col items-center p-2 rounded-lg transition-all group", isActive ? "text-white bg-white/10 shadow-sm" : "text-white/50 hover:text-white hover:bg-white/5")}
        >
          <BookOpen className="w-5 h-5 mb-0.5 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium">Journal</span>
        </NavLink>
      </div>
    </div>
  );
}
