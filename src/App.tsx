import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { NotePage } from './pages/NotePage';
import { TodosPage } from './pages/TodosPage';
import { SettingsPage } from './pages/SettingsPage';
import { initDb } from './lib/db';

import { NotesGrid } from './components/NotesGrid';

function App() {
  useEffect(() => {
    initDb();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<NotesGrid />} />
          <Route path="notes/:id" element={<NotePage />} />
          <Route path="todos" element={<TodosPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
