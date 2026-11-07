import '@fontsource-variable/instrument-sans';
import '@fontsource/ibm-plex-mono/400.css';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ToastProvider } from './components/ui';
import { ApiError } from './lib/api';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

// A session can expire mid-use. Re-checking "me" sends the console to sign-in.
const recheckSession = (error: unknown) => {
  if (error instanceof ApiError && error.status === 401 && error.code === 'unauthenticated') {
    void client.invalidateQueries({ queryKey: ['me'] });
  }
};

const client: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    // The "me" query is the check itself: reacting to its own 401 would loop forever.
    onError: (error, query) => {
      if (query.queryKey[0] !== 'me') recheckSession(error);
    },
  }),
  mutationCache: new MutationCache({ onError: recheckSession }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
