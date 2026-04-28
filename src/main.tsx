import React, { StrictMode, Component, ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'white', backgroundColor: '#990000', height: '100vh', fontFamily: 'monospace' }}>
          <h2>Aplikasi Mengalami Error</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            <summary>Klik untuk detail error</summary>
            {this.state.error && this.state.error.toString()}
          </details>
          <button style={{ marginTop: 20, padding: 10, cursor: 'pointer' }} onClick={() => window.location.reload()}>Muat Ulang Halaman</button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const container = document.getElementById('root')!;
const root = (window as any)._root || createRoot(container);
(window as any)._root = root;

root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
