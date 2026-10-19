import { Camera, Gamepad2, Ghost, MessageCircle, MessagesSquare, Music2, Play, AtSign, Phone, Map, MessageSquare, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PhoneApp {
  id: string;
  name: string;
  icon: LucideIcon;
  bg: string;
  fg: string;
}

/** What the FamilyActivityPicker would offer. On iOS these become opaque ApplicationTokens. */
export const LOCKABLE_APPS: PhoneApp[] = [
  { id: 'tiktok', name: 'TikTok', icon: Music2, bg: 'linear-gradient(140deg,#151515,#2c2c2c)', fg: '#fff' },
  { id: 'instagram', name: 'Instagram', icon: Camera, bg: 'linear-gradient(140deg,#f9a03f,#e1306c 55%,#833ab4)', fg: '#fff' },
  { id: 'snapchat', name: 'Snapchat', icon: Ghost, bg: '#fffc00', fg: '#111' },
  { id: 'youtube', name: 'YouTube', icon: Play, bg: '#ff2a2a', fg: '#fff' },
  { id: 'games', name: 'Games', icon: Gamepad2, bg: 'linear-gradient(140deg,#4f46e5,#7c3aed)', fg: '#fff' },
  { id: 'discord', name: 'Discord', icon: MessageCircle, bg: '#5865f2', fg: '#fff' },
  { id: 'x', name: 'X', icon: AtSign, bg: '#0b0b0b', fg: '#fff' },
  { id: 'reddit', name: 'Reddit', icon: MessagesSquare, bg: '#ff4500', fg: '#fff' },
];

/** Never shielded: calling for help must always work. */
export const ALWAYS_ALLOWED: PhoneApp[] = [
  { id: 'phone', name: 'Phone', icon: Phone, bg: '#22c55e', fg: '#fff' },
  { id: 'messages', name: 'Messages', icon: MessageSquare, bg: '#22c55e', fg: '#fff' },
  { id: 'maps', name: 'Maps', icon: Map, bg: '#0ea5e9', fg: '#fff' },
  { id: 'exhale', name: 'Exhale', icon: Wind, bg: 'linear-gradient(140deg,#5eead4,#38bdf8)', fg: '#05202a' },
];

export const appById = (id: string): PhoneApp | undefined =>
  [...LOCKABLE_APPS, ...ALWAYS_ALLOWED].find((a) => a.id === id);
