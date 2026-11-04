import { engineContract } from '@attivita/core/test/engine-contract';
import { openLocalBackend } from './local-supabase.js';

engineContract('CentralEngine (local Supabase)', openLocalBackend);
