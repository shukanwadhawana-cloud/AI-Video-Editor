import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "apps/ipad/src/main.tsx"), "utf8");

const contracts: Array<[string, RegExp]> = [
  ["natural-language command parser", /function parseCommand\(/],
  ["first-seconds removal", /first\\s\+\$\{number\}/],
  ["last-seconds removal", /last\\s\+\$\{number\}/],
  ["explicit time-range removal", /(?:to|-)\\s\*\$\{number\}/],
  ["middle-seconds removal", /middle\\s\+\$\{number\}/],
  ["keep time range", /keep|trim/],
  ["clip deletion command", /delete\\s\+\(\?:clip\|video\)/],
  ["clip reordering command", /(?:put|move)\\s\+\(\?:clip\|video\)/],
  ["reset/undo command", /reset\|clear\|undo all/],
  ["vertical format command", /9\\s\*\[?:x\\:\]/],
  ["horizontal format command", /16\\s\*\[?:x\\:\]/],
  ["command input wired to applyCommand", /onClick=\{applyCommand\}/],
];

const failures = contracts.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
if (failures.length) {
  console.error("Phase 2 smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 2 smoke passed: ${contracts.length} natural-language editing contracts verified.`);
