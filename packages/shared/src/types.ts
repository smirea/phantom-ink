export const TEAMS = ['sun', 'moon'] as const;

export type Team = (typeof TEAMS)[number];

export type Brand<T extends string, V extends string = string> = V & { __brand: T };
