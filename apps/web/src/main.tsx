import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { isDemoUrl, openDemoSession, startDemo } from './demo/demo.js';
import { configuredProviders, openCentralSession, sendMagicLink, signInWith } from './session/central.js';
import { withGoogleProjects } from './session/google-config.js';
import './styles.css';

// The demo never opens the account's session: its data stay in this page's memory.
const open = async () => (isDemoUrl() ? openDemoSession() : withGoogleProjects(await openCentralSession()));
const login = { sendMagicLink, signInWith, providers: configuredProviders(), startDemo };

createRoot(document.getElementById('root')!).render(
  <StrictMode><App open={open} login={login} /></StrictMode>,
);
