import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { normalizeAppUrl } from './url';

normalizeAppUrl(import.meta.env.BASE_URL);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
