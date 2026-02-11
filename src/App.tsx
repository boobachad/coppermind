import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { NotePage } from './pages/NotePage';
import { NewNotePage } from './pages/NewNotePage';
import { TodosPage } from './pages/TodosPage';
import { NodesPage } from './pages/NodesPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/404';
import { GridPage } from './pos/pages/GridPage';
import { GoalsPage } from './pos/pages/GoalsPage';
import { HomePage } from './pos/pages/HomePage';
import { SheetsPage } from './pos/pages/SheetsPage';
import { DailyPage } from './pos/pages/DailyPage';
import JournalPage from './journal/pages/JournalPage';
import EntryPage from './journal/pages/EntryPage';
import { initDb } from './lib/db';
import { NotesGrid } from './components/NotesGrid';
import { initCaptureService, cleanupCaptureService } from './lib/CaptureService';
import { initPgSync, stopPgSync } from './lib/pgSync';
import { ConfirmDialogProvider } from './components/ConfirmDialog';

import { Toaster } from './components/ui/sonner';

function App() {
  useEffect(() => {
    initDb().then(() => {
      initPgSync();
    });
    initCaptureService();

    return () => {
      cleanupCaptureService();
      stopPgSync();
    };
  }, []);

  return (
    <ConfirmDialogProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<NotesGrid />} />
            <Route path="notes/new" element={<NewNotePage />} />
            <Route path="notes/:id" element={<NotePage />} />
            <Route path="todos" element={<TodosPage />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="pos" element={<HomePage />} />
            <Route path="pos/grid" element={<GridPage />} />
            <Route path="pos/grid/:date" element={<DailyPage />} />
            <Route path="pos/goals" element={<GoalsPage />} />
            <Route path="pos/sheets" element={<SheetsPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="journal/:date" element={<EntryPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ConfirmDialogProvider>
  );
}

export default App;
