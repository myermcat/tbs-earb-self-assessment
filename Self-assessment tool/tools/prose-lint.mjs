#!/usr/bin/env node
/**
 * Checks the guide's prose against the writing rules.
 *
 * This exists because the rules were being applied from memory, and memory kept
 * missing things. The antithesis rule in particular ("X rather than Y") got
 * through repeatedly. A rule that is only in someone's head is not a rule.
 *
 * Run it before any commit that touches prose:
 *   node scripts/prose-lint.mjs
 *
 * Every hit is printed with its file, line, and the offending text. Some rules
 * have legitimate exceptions; add them to ALLOW below with a reason, so the
 * exception is recorded rather than argued about again.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** Rules. `re` runs against each line of every source file under src/. */
const RULES = [
  {
    id: "antithesis",
    // "X rather than Y", "X, not Y", "X instead of Y" used as a rhetorical
    // flourish. The construction reads as marketing copy and says less than a
    // plain sentence. Write the thing that is true and stop.
    re: /\b(?:rather than|instead of)\b|,\s+not\s+(?:a|an|the|because|by|for|to|what|how|who|its|his|her|their|your|our)\b/gi,
    why: 'antithesis ("X rather than Y", "X, not Y"). Say the true thing plainly and stop.',
  },
  {
    id: "land",
    re: /\bland(?:s|ed|ing)?\b/gi,
    why: '"land" in any form.',
  },
  {
    id: "quiet-honest",
    re: /\b(?:quiet|quietly|honest|honestly)\b/gi,
    why: "AI filler adjective.",
  },
  {
    id: "sits",
    re: /\bsits?\b/gi,
    why: '"sit"/"sits" as a placement verb.',
  },
  {
    id: "ship",
    re: /\bship(?:s|ped|ping)?\b/gi,
    why: '"ship" as a verb for releasing software.',
  },
  {
    id: "em-dash",
    re: /—|–/g,
    why: "em-dash or en-dash. Use a comma, a full stop, or brackets.",
  },
  {
    id: "hedge-opener",
    re: /(?:^|["'`>\s])(?:It(?:'s| is) worth noting|Note that|Importantly|Of course|Simply put|In short|That said|At the end of the day)\b/g,
    why: "hedge or filler opener. Start with the sentence.",
  },
  {
    id: "delve-tapestry",
    re: /\b(?:delve|tapestry|realm|leverage|utilize|robust|seamless|holistic|myriad|plethora|underscore|pivotal|crucial|vital|navigate the|in today's)\b/gi,
    why: "AI register word.",
  },
  {
    id: "not-just",
    re: /\bnot (?:just|only|merely|simply)\b/gi,
    why: '"not just X but Y" escalation.',
  },
];

/**
 * Recorded exceptions. Each is a substring of the offending line plus the reason
 * it stands, so nobody relitigates it.
 */
const ALLOW = [
  { rule: "sits", match: "sits beside", why: "literal placement of one score next to another on screen" },
  {
    rule: "delve-tapestry",
    match: "crucial",
    why: "never used in reader-facing copy; kept so the rule stays visible",
  },
];

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "components/ui"]);
/** Files that hold no reader-facing prose. */
const SKIP_FILE = /\.(?:css|json|svg|png|jpg|ico)$|routeTree\.gen\.ts$|prose-lint/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP_DIRS.has(name)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (!SKIP_FILE.test(full)) out.push(full);
  }
  return out;
}

/**
 * Only reader-facing prose counts. Code identifiers, import paths, class names
 * and comments are not published, and flagging them trains people to ignore the
 * linter.
 */
function proseOnly(line) {
  let s = line;
  if (/^\s*(?:\/\/|\*|\/\*)/.test(s)) return ""; // comment line
  s = s.replace(/^\s*import .*$/, "");
  s = s.replace(/className=(?:"[^"]*"|\{[^}]*\})/g, "");
  s = s.replace(/\b(?:to|href|id|linkKey|icon|path|key|slug)[:=]\s*"[^"]*"/g, "");
  s = s.replace(/\b[a-z]+-[a-z-]+\b/g, " "); // kebab identifiers
  return s;
}

const hits = [];
for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((raw, i) => {
    const line = proseOnly(raw);
    if (!line.trim()) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        const allowed = ALLOW.some(
          (a) => a.rule === rule.id && raw.includes(a.match),
        );
        if (allowed) continue;
        hits.push({
          file: relative(ROOT, file),
          line: i + 1,
          rule: rule.id,
          text: m[0].trim(),
          why: rule.why,
          context: raw.trim().slice(0, 150),
        });
      }
    }
  });
}

if (hits.length === 0) {
  console.log("Prose lint: clean.");
  process.exit(0);
}

const byRule = new Map();
for (const h of hits) {
  if (!byRule.has(h.rule)) byRule.set(h.rule, []);
  byRule.get(h.rule).push(h);
}

console.log(`Prose lint: ${hits.length} hit${hits.length === 1 ? "" : "s"}.\n`);
for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${rule} (${list.length}) — ${list[0].why}`);
  for (const h of list) {
    console.log(`  ${h.file}:${h.line}  "${h.text}"`);
    console.log(`      ${h.context}`);
  }
  console.log("");
}
process.exit(1);
