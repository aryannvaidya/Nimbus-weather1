import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';

window.addEventListener('error', (event) => {
  // Broadly silence "Script error." and similar cryptic cross-origin messages
  // These are usually from browser extensions or the iframe container and provide no debug value
  const msg = event.message?.toLowerCase() || '';
  if (
    msg.includes('script error') ||
    msg.includes('failed to fetch') || 
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('mime type')
  ) {
    return;
  }

  const errorInfo = {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    errorObj: event.error ? {
      message: event.error.message,
      stack: event.error.stack
    } : 'None'
  };
  console.error('Global capture:', JSON.stringify(errorInfo, null, 2));
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message?.toLowerCase() || String(event.reason).toLowerCase();
  
  // Silence cryptic promise rejections that are already handled by the UI
  if (
    reason.includes('script error') || 
    reason.includes('failed to fetch') || 
    reason.includes('abort') ||
    reason.includes('timeout')
  ) {
    event.preventDefault(); // Prevent browser from logging to console
    return;
  }
  
  console.error('Unhandled Promise Rejection:', event.reason);
});

// Improve scrolling performance in WebView
window.addEventListener('touchstart', () => {}, { passive: true });
window.addEventListener('touchmove', () => {}, { passive: true });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(err => {
      console.warn("Service Worker registration failed:", err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
