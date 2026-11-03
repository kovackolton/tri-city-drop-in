import { Game } from './models';
export interface SharedGame { game: Game; share: { url: string; title: string; description: string; availability: string; action: string; open: boolean }; }
export function sharedEventId(search: string) { return new URLSearchParams(search).get('event') ?? ''; }
export function shareMessage(share: SharedGame['share']) { return `${share.title}\n${share.description}\nTap the link to view the game and join.`; }
