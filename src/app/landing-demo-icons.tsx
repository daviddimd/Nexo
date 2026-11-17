export function SsdIcon() {
 return <svg viewBox="0 0 40 24" width="32" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
  <path d="M4 5h30v5h3v4h-3v5H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>
  <circle cx="6.5" cy="12" r="1.5"/><rect x="11" y="8.5" width="8" height="7" rx="1"/><rect x="22" y="8.5" width="8" height="7" rx="1"/>
  <path d="M34 7h2m-2 10h2"/>
 </svg>;
}

export function PlaybackIcon({playing}: {playing: boolean}) {
 return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="currentColor">
  {playing ? <path d="M6 4h3v12H6zm5 0h3v12h-3z"/> : <path d="m7 4 10 6-10 6z"/>}
 </svg>;
}
