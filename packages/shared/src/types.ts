export const TEAMS = ['sun', 'moon'] as const;

export type Team = (typeof TEAMS)[number];
