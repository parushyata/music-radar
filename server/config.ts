import { settingsRepo } from './db.ts';
import type { ConfigStatus, ConfigUpdate } from '../shared/types.ts';

// Environment variables win over keys saved from the Settings dialog.
export const apiKeys = () => ({
  ticketmaster: process.env.TICKETMASTER_API_KEY || settingsRepo.get('ticketmasterKey') || '',
  bandsintown: process.env.BANDSINTOWN_APP_ID || settingsRepo.get('bandsintownAppId') || '',
});

export function configStatus(): ConfigStatus {
  const k = apiKeys();
  return { ticketmaster: !!k.ticketmaster, bandsintown: !!k.bandsintown };
}

export function updateConfig(update: ConfigUpdate): void {
  if (typeof update.ticketmasterKey === 'string') settingsRepo.set('ticketmasterKey', update.ticketmasterKey.trim());
  if (typeof update.bandsintownAppId === 'string') settingsRepo.set('bandsintownAppId', update.bandsintownAppId.trim());
}
