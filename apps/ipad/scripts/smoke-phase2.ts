import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "apps/ipad/src/main.tsx"), "utf8");

const contracts: Array<[string, string]> = [
  ["natural-language command parser", "function parseCommand("],
  ["first-seconds removal", "first\\s+${number}"],
  ["last-seconds removal", "last\\s+${number}"],
  ["explicit time-range removal", "(?:to|-)\\s*${number}"],
  ["middle-seconds removal", "middle\\s+${number}"],
  ["keep time range", "const keep = text.match"],
  ["clip deletion command", "delete|remove"],
  ["clip reordering command", "(?:put|move)"],
  ["reset/undo command", "reset|clear|undo all"],
  ["vertical format command", "9\\s*[:x]\\s*16"],
  ["horizontal format command", "16\\s*[:x]\\s*9"],
  ["command input wired to applyCommand", "onClick={applyCommand}"],
];

const failures = contracts.filter(([, expected]) => !source.includes(expected)).map(([name]) => name);
if (failures.length) {
  console.error("Phase 2 smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 2 smoke passed: ${contracts.length} natural-language editing contracts verified.`);
