/**
 * Line icons, at one weight.
 *
 * They live here because two screens want the same download icon, and a copy in each file is
 * how two copies of one icon drift apart.
 */
const ICO = 'viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

export const ICON_SHARE = `<svg ${ICO}><path d="M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/>` +
  '<circle cx="8.5" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>';
export const ICON_MAIL = `<svg ${ICO}><rect x="2" y="4" width="20" height="16" rx="2"/>` +
  '<path d="m2 7 10 6 10-6"/></svg>';
export const ICON_DOWN = `<svg ${ICO}><path d="M12 3v12"/><path d="m7 12 5 5 5-5"/>` +
  '<path d="M3 21h18"/></svg>';
export const ICON_PRINT = `<svg ${ICO}><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/>` +
  '<path d="M6 17h12v4H6z"/></svg>';
