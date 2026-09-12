import fs from "node:fs";

const path = "apps/ipad/src/main.tsx";
let source = fs.readFileSync(path, "utf8");

if (!source.includes('from "./phase6"')) {
  source = source.replace(
    'import { transcribeClip } from "./transcription";\n',
    'import { transcribeClip } from "./transcription";\nimport { applyPhase6Command } from "./phase6";\n',
  );
}

const old = '  const applyCommand = () => { const result = parseCommand(command, clips, selectedId, vertical); setClips(result.clips); setSelectedId(result.selectedId); setVertical(result.vertical); setPlan({ label: result.vertical ? "9:16 vertical" : "Original format", vertical: result.vertical }); setStatus(result.message); setCommand(""); };';
const replacement = `  const applyCommand = () => {
    const result = parseCommand(command, clips, selectedId, vertical);
    const phase6 = applyPhase6Command(command, result.clips, captions);
    if (phase6.handled) {
      setClips(phase6.clips as Clip[]);
      setCaptions(phase6.captions as Caption[]);
      setSelectedId(result.selectedId);
      setVertical(result.vertical);
      setPlan({ label: result.vertical ? "9:16 vertical" : "Original format", vertical: result.vertical });
      setStatus(phase6.message);
      setCommand("");
      return;
    }
    setClips(result.clips);
    setSelectedId(result.selectedId);
    setVertical(result.vertical);
    setPlan({ label: result.vertical ? "9:16 vertical" : "Original format", vertical: result.vertical });
    setStatus(result.message);
    setCommand("");
  };`;

if (!source.includes(old)) throw new Error("Phase 6 patch target not found in main.tsx");
source = source.replace(old, replacement);
fs.writeFileSync(path, source);
console.log("Phase 6 integration patch applied");
