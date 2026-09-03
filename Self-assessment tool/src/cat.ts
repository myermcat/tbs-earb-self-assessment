/**
 * The picture for a screen that has nothing to show.
 *
 * Drawn here because the page makes no requests: its own rule blocks them, and an empty state
 * that fails to load its own illustration is worse than one without a picture. It takes its
 * colours from the theme, so it belongs to the page in both light and dark.
 *
 * The first attempt gave it horns. The head outline peaked at both sides, which were the ears,
 * and then two more thin triangles were drawn floating above and outside those peaks. Now the
 * head is a plain circle and the ears are wide triangles whose base corners sit inside it, so
 * they read as ears joined to a head.
 *
 * The second attempt put the mouth on the body's top edge, where the two curves crossed and
 * read as one line. The face sits higher and the body starts lower, so there are eleven units
 * of clear space between them.
 */
export const SAD_CAT = `
<svg viewBox="0 0 240 180" role="img" aria-label="A cat sitting with its ears down" class="sad-cat">
  <ellipse cx="120" cy="166" rx="56" ry="7" fill="currentColor" opacity=".10"/>

  <path d="M158 158c22-2 34-16 32-32-2-14-18-18-24-8-5 8 2 16 10 13"
        fill="none" stroke="currentColor" stroke-opacity=".26" stroke-width="8"
        stroke-linecap="round"/>

  <path d="M120 96c-24 0-40 24-42 52-1 12 7 18 19 18h46c12 0 20-6 19-18-2-28-18-52-42-52z"
        fill="currentColor" opacity=".22"/>
  <ellipse cx="104" cy="160" rx="9" ry="5" fill="currentColor" opacity=".30"/>
  <ellipse cx="136" cy="160" rx="9" ry="5" fill="currentColor" opacity=".30"/>

  <path d="M97 51L98 25l14 17z" fill="currentColor" opacity=".30"/>
  <path d="M143 51L142 25l-14 17z" fill="currentColor" opacity=".30"/>
  <circle cx="120" cy="70" r="30" fill="currentColor" opacity=".30"/>
  <path d="M103 46l9-5-10-9z" fill="currentColor" opacity=".16"/>
  <path d="M137 46l-9-5 10-9z" fill="currentColor" opacity=".16"/>

  <circle cx="110" cy="68" r="3.6" fill="currentColor" opacity=".62"/>
  <circle cx="130" cy="68" r="3.6" fill="currentColor" opacity=".62"/>
  <path d="M117 78h6l-3 3z" fill="currentColor" opacity=".5"/>
  <path d="M112 88q8-6 16 0" fill="none" stroke="currentColor" stroke-opacity=".5"
        stroke-width="2.4" stroke-linecap="round"/>
  <g fill="none" stroke="currentColor" stroke-opacity=".40" stroke-width="1.8" stroke-linecap="round">
    <path d="M112 79L86 74"/>
    <path d="M112 82L87 84"/>
    <path d="M128 79l26-5"/>
    <path d="M128 82l25 2"/>
  </g>
</svg>`;
