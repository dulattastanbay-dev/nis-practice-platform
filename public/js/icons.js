// Consistent line-icon set (Lucide-style, 24x24, currentColor).
// Replaces emoji used as UI icons. Sizing/colour is controlled via CSS.
const ICON_PATHS = {
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.4 12.3 2.4 2.4 4.8-5.1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>',
  fileText: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  book: '<path d="M5 4a2 2 0 0 1 2-2h11v16H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 1 2-2h11"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  star: '<path d="m12 3 2.6 5.7 6.2.7-4.6 4.2 1.2 6.1-5.4-3.1-5.4 3.1 1.2-6.1L3.2 9.4l6.2-.7z" fill="currentColor" stroke="none"/>',
  starOutline: '<path d="m12 3 2.6 5.7 6.2.7-4.6 4.2 1.2 6.1-5.4-3.1-5.4 3.1 1.2-6.1L3.2 9.4l6.2-.7z"/>',
  cap: '<path d="M12 4 2 9l10 5 10-5z"/><path d="M6 11.5V16c0 1.3 2.7 3 6 3s6-1.7 6-3v-4.5"/>',
  bulb: '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.8 10.6c.5.5.8 1.1.8 1.9v.5h6v-.5c0-.8.3-1.4.8-1.9A6 6 0 0 0 12 3z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3.5 12h17"/><path d="M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7.5 8.5 5.5 8.5-5.5"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22"/><path d="M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0z"/>',
  bookOpen: '<path d="M12 7v13"/><path d="M3.5 5.5A2 2 0 0 1 5.5 4H9a3 3 0 0 1 3 3 3 3 0 0 1 3-3h3.5a2 2 0 0 1 2 1.7V18a1 1 0 0 1-1 1H15a2.5 2.5 0 0 0-3 0 2.5 2.5 0 0 0-3 0H4.5a1 1 0 0 1-1-1z"/>',
  alertCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
  sparkles: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 17l-1.8-5.5L5 9.7l5.2-1.8z" fill="currentColor" stroke="none"/><path d="M18.6 14l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z" fill="currentColor" stroke="none"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" fill="currentColor" stroke="none"/>',
};

function icon(name, cls) {
  const p = ICON_PATHS[name];
  if (!p) return '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" `
    + `stroke-linecap="round" stroke-linejoin="round" class="ic${cls ? ' ' + cls : ''}" aria-hidden="true">${p}</svg>`;
}
