/**
 * Gives every backlog item a number, and gives a new one the next number up.
 *
 *   node tools/number-backlog.mjs
 *
 * WHY A NUMBER WHEN EVERY ITEM ALREADY HAS AN ID. The id is a slug, it is the Firestore document
 * name that Dan's priorities are stored under, and it is long. Nobody says 'french-missing-
 * assessor-screens' out loud or types it into a commit message. A number is short enough to say,
 * to write on a note, and to put in a branch name, which is the whole point of giving one to
 * every item: so two people on different days can mean the same thing.
 *
 * WHAT A NUMBER IS NOT. It is an address, not a date and not an order. #12 is not older or more
 * important than #80. It is assigned once and never reused, never renumbered, and never freed
 * when an item closes, because the point of a number is that it still finds the thing a month
 * later when somebody asks what #47 was about.
 *
 * The id stays the record's real name. Anything that writes to the store keeps using the id.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { items } from '../NOTES/backlog.data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'NOTES', 'backlog.data.mjs');

const taken = new Set(items.map((i) => i.n).filter(Boolean));
let next = Math.max(0, ...taken) + 1;

const want = items.filter((i) => !i.n);
if (!want.length) {
  console.log(`Every item has a number. ${taken.size} of them, next is ${next}.`);
  process.exit(0);
}

/**
 * Written in beside the id rather than anywhere else in the entry, so the two names of a thing
 * sit together and a diff shows one line per item.
 */
let src = readFileSync(file, 'utf8');
const missed = [];
for (const i of want) {
  const at = new RegExp(`(\\n\\s*id: "${i.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}",)`);
  if (!at.test(src)) { missed.push(i.id); continue; }
  src = src.replace(at, `$1 n: ${next},`);
  next += 1;
}
writeFileSync(file, src);

console.log(`Numbered ${want.length - missed.length}, next is ${next}.`);
if (missed.length) {
  console.error(`Could not find in the file: ${missed.join(', ')}`);
  process.exit(1);
}
console.log('Now rebuild the page: node tools/build-backlog.mjs');
