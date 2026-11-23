'use client';

import {useState} from 'react';
import {chileDestinationKey, chileRegions, findChileRegion} from '../catalog/chile-destinations';

export default function ChileDestinationFields({initialRegion='', initialCommune='', communeName='commune'}: {
  initialRegion?: string;
  initialCommune?: string;
  communeName?: 'commune' | 'city';
}) {
  const knownRegion = findChileRegion(initialRegion);
  const knownCommune = knownRegion?.communes.find(commune =>
    chileDestinationKey(knownRegion.name, commune) === chileDestinationKey(initialRegion, initialCommune)
  );
  const [region, setRegion] = useState(knownRegion?.name ?? '');
  const [commune, setCommune] = useState(knownCommune ?? '');
  const communes = chileRegions.find(candidate => candidate.name === region)?.communes ?? [];

  return <>
    <label>Región
      <select name="region" autoComplete="address-level1" value={region} required
        onChange={event => {setRegion(event.target.value); setCommune('');}}>
        <option value="">Selecciona una región</option>
        {chileRegions.map(option => <option key={option.code}>{option.name}</option>)}
      </select>
    </label>
    <label>Ciudad o comuna
      <select name={communeName} autoComplete="address-level2" value={commune} required disabled={!region}
        onChange={event => setCommune(event.target.value)}>
        <option value="">Selecciona una comuna</option>
        {communes.map(option => <option key={option}>{option}</option>)}
      </select>
    </label>
  </>;
}
