import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto h-full relative bg-white rounded-tl-2xl rounded-bl-2xl shadow-[-10px_0_30px_rgba(0,0,0,0.08)]">
        <Outlet />
      </main>
    </div>
  );
}
