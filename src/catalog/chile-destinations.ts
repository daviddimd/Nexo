import regions from './chile-regions.json';

export const chileRegions = regions;

const placeKey = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const legacyRegions: Record<string, string> = {
  metropolitana: '13', santiago: '13', biobio: '08', araucania: '09',
  ohiggins: '06', aysen: '11', magallanes: '12',
};

export function findChileRegion(name: string) {
  const key = placeKey(name.replace(/^región\s+(?:de\s+|del\s+)?/i, ''));
  return regions.find(region =>
    region.code === legacyRegions[key] ||
    placeKey(region.name.replace(/^región\s+(?:de\s+|del\s+)?/i, '')) === key
  );
}

export function chileDestinationKey(region: string, commune: string) {
  const code = findChileRegion(region)?.code;
  const city = placeKey(commune);
  return (code ?? placeKey(region)) + ':' + (code === '13' && city === 'santiagocentro' ? 'santiago' : city);
}
