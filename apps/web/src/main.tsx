import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { configuredProviders, openCentralSession, sendMagicLink, signInWith } from './session/central.js';
import './styles.css';

const login = { sendMagicLink, signInWith, providers: configuredProviders() };

createRoot(document.getElementById('root')!).render(
  <StrictMode><App open={openCentralSession} login={login} /></StrictMode>,
);
