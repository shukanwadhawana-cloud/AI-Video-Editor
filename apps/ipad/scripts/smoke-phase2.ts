import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "apps/ipad/src/main.tsx"), "utf8");

// Source-level Phase 2 contracts. Keep matching formatting-tolerant.
const contracts: Array<[string, RegExp]> = [
  ["natural-language command parser", /function parseCommand\(/],
  ["first-seconds removal", /const first = text\.match/],
  ["last-seconds removal", /const last = text\.match/],
  ["explicit time-range removal", /const range = text\.match/],
  ["middle-seconds removal", /const middle = text\.match/],
  ["keep time range", /const keep = text\.match/],
  ["clip deletion command", /delete.*clip|clip.*delete|delete.*video/],
  ["clip reordering command", /const move = text\.match/],
  ["reset/undo command", /reset\|clear\|undo all/],
  ["vertical format command", /9\\s\*\[?:x\\:\]\\s\*16/],
  ["horizontal format command", /16\\s\*\[?:x\\:\]\\s\*9/],
  ["command input wired to applyCommand", /onClick=\{applyCommand\}/],
];

const failures = contracts.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
if (failures.length) {
  console.error("Phase 2 smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 2 smoke passed: ${contracts.length} natural-language editing contracts verified.`);
