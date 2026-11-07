import { Link, Route, Routes } from 'react-router';
import { ConsoleLayout } from './components/ConsoleLayout';
import { buttonClass, EmptyState } from './components/ui';
import { ConversationDetailPage } from './pages/ConversationDetailPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { DemoStorePage } from './pages/DemoStorePage';
import { GapsPage } from './pages/GapsPage';
import { HandoffsPage } from './pages/HandoffsPage';
import { ImportPage } from './pages/ImportPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  return (
    <EmptyState title="Page not found" actions={<Link to="/" className={buttonClass('primary')}>Go home</Link>}>
      This page doesn't exist or may have moved.
    </EmptyState>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/demo" element={<DemoStorePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app" element={<ConsoleLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="conversations/:id" element={<ConversationDetailPage />} />
        <Route path="handoffs" element={<HandoffsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="knowledge/import" element={<ImportPage />} />
        <Route path="gaps" element={<GapsPage />} />
        <Route path="playground" element={<PlaygroundPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
