import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { configuredProviders, openCentralSession, sendMagicLink, signInWith } from './session/central.js';
import { withGoogleProjects } from './session/google-config.js';
import './styles.css';

const open = async () => withGoogleProjects(await openCentralSession());
const login = { sendMagicLink, signInWith, providers: configuredProviders() };

createRoot(document.getElementById('root')!).render(
  <StrictMode><App open={open} login={login} /></StrictMode>,
);
