/**
 * The picture for a screen that has nothing to show.
 *
 * Drawn here because the page makes no requests: its own rule blocks them, and an empty state
 * that fails to load its own illustration is worse than one without a picture. It takes its
 * colours from the theme, so it belongs to the page in both light and dark.
 */
export const SAD_CAT = `
<svg viewBox="0 0 240 180" role="img" aria-label="A cat sitting with its back turned" class="sad-cat">
  <ellipse cx="120" cy="163" rx="62" ry="8" fill="currentColor" opacity=".10"/>
  <path d="M78 158c-4-30 2-56 16-70 8-8 18-12 26-12s18 4 26 12c14 14 20 40 16 70z"
        fill="currentColor" opacity=".22"/>
  <path d="M96 92c-6-10-8-22-7-34l19 14c8-3 16-3 24 0l19-14c1 12-1 24-7 34z"
        fill="currentColor" opacity=".30"/>
  <path d="M97 64l-6-22 17 13z" fill="currentColor" opacity=".38"/>
  <path d="M143 64l6-22-17 13z" fill="currentColor" opacity=".38"/>
  <circle cx="108" cy="78" r="3.4" fill="currentColor" opacity=".62"/>
  <circle cx="132" cy="78" r="3.4" fill="currentColor" opacity=".62"/>
  <path d="M113 88q7 6 14 0" fill="none" stroke="currentColor" stroke-opacity=".55"
        stroke-width="2.4" stroke-linecap="round"/>
  <path d="M160 150c22-4 34-18 30-36-3-14-16-20-24-14-7 5-6 16 2 18 6 2 10-2 9-7"
        fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width="7"
        stroke-linecap="round"/>
</svg>`;
