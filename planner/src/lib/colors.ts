// Muted colours per country (map path, calendar bars) and per transport mode.
export const COUNTRY_COLOR: Record<string, string> = {
  NI: '#4f7cac', HN: '#5c9c8a', SV: '#8a6fb0', GT: '#b07a4f', CR: '#5f9e5f', PA: '#a8695e',
  CO: '#c2a03a', BO: '#b0566b', MX: '#3f8f8f', PE: '#9a7b4f', EC: '#6b8fb8', ES: '#8a8f96',
  DK: '#8a8f96', US: '#8a8f96', BR: '#7a9a5c',
}
export const countryColor = (c: string) => COUNTRY_COLOR[c] ?? '#8a8f96'

export const COUNTRY_NAME: Record<string, string> = {
  NI: 'Nicaragua', HN: 'Honduras', SV: 'El Salvador', GT: 'Guatemala', CR: 'Costa Rica', PA: 'Panama', CO: 'Colombia',
  BO: 'Bolivia', MX: 'Mexico', PE: 'Peru', EC: 'Ecuador', ES: 'Spain', DK: 'Denmark', US: 'USA', BR: 'Brazil',
  NL: 'Netherlands', FR: 'France', DE: 'Germany', GB: 'United Kingdom', PT: 'Portugal', CA: 'Canada',
}
export const countryName = (c: string) => COUNTRY_NAME[c] ?? c

export const MODE_COLOR: Record<string, string> = {
  bus: '#4d7c5c', chicken_bus: '#4d7c5c', colectivo: '#4d7c5c', shuttle: '#6b8f7a', boat: '#3d7fd6', flight: '#c27a1c', train: '#7a5c9c',
}
export const MODE_SHORT: Record<string, string> = {
  bus: 'BUS', chicken_bus: 'BUS', colectivo: 'COL', shuttle: 'SHT', boat: 'BOAT', flight: 'FLY', train: 'TRN',
}
export const MODE_LABEL: Record<string, string> = {
  bus: 'Bus', chicken_bus: 'Chicken bus', colectivo: 'Colectivo', shuttle: 'Shuttle', boat: 'Boat', flight: 'Flight', train: 'Train',
}
