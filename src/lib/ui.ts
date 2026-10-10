import type { PublicPlayer, PublicTeam } from '../engine';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return [...parts[0]].slice(0, 2).join('').toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function teamOf(teams: PublicTeam[], teamId: string | undefined): PublicTeam | undefined {
  return teams.find((t) => t.id === teamId);
}

export function playerById(players: PublicPlayer[], id: string | null | undefined): PublicPlayer | undefined {
  return players.find((p) => p.id === id);
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
