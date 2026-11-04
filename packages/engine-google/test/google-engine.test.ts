import { engineContract } from '@attivita/core/test/engine-contract';
import { openEmulatorBackend } from './local-firebase.js';

engineContract('GoogleEngine (emulator)', openEmulatorBackend);
