import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { NotePage } from './pages/NotePage';
import { NewNotePage } from './pages/NewNotePage';
import { NodesPage } from './pages/NodesPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/404';
import { GridPage } from './pos/pages/GridPage';
import { HomePage } from './pos/pages/HomePage';
import { SheetsPage } from './pos/pages/SheetsPage';
import GitHubPage from './pos/pages/GitHubPage';
import { DailyPage } from './pos/pages/DailyPage';
import JournalPage from './journal/pages/JournalPage';
import EntryPage from './journal/pages/EntryPage';
import { UnifiedGoalsPage } from './pages/UnifiedGoalsPage';
import { DailyBriefingPage } from './pos/pages/DailyBriefingPage';
import KnowledgePage from './pages/KnowledgePage';
import MonthlyGoalsPage from './pages/MonthlyGoalsPage';
import { LadderBrowser } from './components/codeforces/LadderBrowser';
import LadderView from './components/codeforces/LadderView';
import CategoryBrowser from './components/codeforces/CategoryBrowser';
import { FriendsManager } from './components/codeforces/FriendsManager';
import { FriendsLadder } from './components/codeforces/FriendsLadder';
import { DailyProblemsPicker } from './components/codeforces/DailyProblemsPicker';
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
            <Route path="goals" element={<UnifiedGoalsPage />} />
            <Route path="monthly-goals" element={<MonthlyGoalsPage />} />
            <Route path="knowledge" element={<KnowledgePage />} />
            <Route path="briefing" element={<DailyBriefingPage />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="pos" element={<HomePage />} />
            <Route path="pos/grid" element={<GridPage />} />
            <Route path="pos/grid/:date" element={<DailyPage />} />
            <Route path="pos/sheets" element={<SheetsPage />} />
            <Route path="pos/github" element={<GitHubPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="journal/:date" element={<EntryPage />} />
            <Route path="cf/ladders" element={<LadderBrowser />} />
            <Route path="cf/ladders/:id" element={<LadderView />} />
            <Route path="cf/categories" element={<CategoryBrowser />} />
            <Route path="cf/friends" element={<FriendsManager />} />
            <Route path="cf/friends-ladder" element={<FriendsLadder />} />
            <Route path="cf/daily" element={<DailyProblemsPicker />} />
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
