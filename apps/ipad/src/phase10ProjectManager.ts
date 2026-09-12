import { clearProject, loadProject, saveProject } from "./projectStore";

const NAME_KEY = "ai-video-editor-project-name";
const DEFAULT_NAME = "Untitled Project";
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function getName() { try { return localStorage.getItem(NAME_KEY) || DEFAULT_NAME; } catch { return DEFAULT_NAME; } }
function setName(name: string) { try { localStorage.setItem(NAME_KEY, name); } catch { /* metadata can remain in memory */ } }

async function resetEdits() {
  const loaded = await loadProject(); if (!loaded) return false;
  const snapshot = { ...loaded.snapshot, clips: loaded.snapshot.clips.map((clip) => ({ ...clip, segments: [{ start: 0, end: clip.duration }] })), captions: [], selectedId: loaded.snapshot.clips[0]?.id || null, vertical: false };
  await saveProject(snapshot, Object.entries(loaded.files).map(([id, file]) => ({ id, file })));
  return true;
}

async function duplicateClip(index: number) {
  const loaded = await loadProject(); if (!loaded || index < 0 || index >= loaded.snapshot.clips.length) return;
  const source = loaded.snapshot.clips[index]; const copyId = makeId();
  const copy = { ...source, id: copyId, name: `${source.name} copy`, segments: source.segments.map((segment) => ({ ...segment })) };
  const captions = loaded.snapshot.captions.map((caption) => caption.clipId === source.id ? { ...caption, id: makeId(), clipId: copyId } : caption);
  const snapshot = { ...loaded.snapshot, clips: [...loaded.snapshot.clips.slice(0, index + 1), copy, ...loaded.snapshot.clips.slice(index + 1)], captions, selectedId: copyId };
  const files = Object.entries(loaded.files).map(([id, file]) => ({ id, file }));
  const sourceFile = loaded.files[source.id]; if (sourceFile) files.push({ id: copyId, file: sourceFile });
  await saveProject(snapshot, files);
}

async function renameClip(index: number) {
  const loaded = await loadProject(); if (!loaded || index < 0 || index >= loaded.snapshot.clips.length) return;
  const clip = loaded.snapshot.clips[index]; const nextName = window.prompt("Clip name", clip.name)?.trim();
  if (!nextName || nextName === clip.name) return;
  const snapshot = { ...loaded.snapshot, clips: loaded.snapshot.clips.map((item, i) => i === index ? { ...item, name: nextName.slice(0, 120) } : item) };
  await saveProject(snapshot, Object.entries(loaded.files).map(([id, file]) => ({ id, file })));
}

function ensureClipDuplicateButtons(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".clip-actions").forEach((actions) => {
    if (actions.querySelector("[data-phase10-duplicate-clip]")) return;
    const button = document.createElement("button");
    button.type = "button"; button.title = "Duplicate clip"; button.textContent = "+"; button.dataset.phase10DuplicateClip = "true";
    button.setAttribute("aria-label", "Duplicate clip"); actions.appendChild(button);
  });
}

function install() {
  const app = document.querySelector(".app"); const topbar = document.querySelector(".topbar");
  if (!app || !topbar || document.querySelector(".project-panel")) return;
  const panel = document.createElement("section"); panel.className = "project-panel";
  panel.innerHTML = `<span class="project-label">Project</span><input class="project-name-input" aria-label="Project name" maxlength="80" /><button type="button" data-project-action="rename">Rename</button><button type="button" data-project-action="duplicate">Duplicate</button><button type="button" data-project-action="reset">Reset edits</button><button type="button" data-project-action="new">New project</button><span class="project-save">Local project • autosaved</span>`;
  const input = panel.querySelector<HTMLInputElement>(".project-name-input")!; input.value = getName();

  panel.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-project-action]"); if (!button) return;
    const action = button.dataset.projectAction;
    if (action === "rename") { const name = input.value.trim().slice(0, 80) || DEFAULT_NAME; input.value = name; setName(name); window.dispatchEvent(new CustomEvent("phase10-status", { detail: `Project renamed • ${name}` })); return; }
    if (action === "new") { if (!window.confirm("Start a new project? The current local project will be cleared.")) return; button.disabled = true; try { await clearProject(); setName(DEFAULT_NAME); window.location.reload(); } catch { button.disabled = false; window.alert("Could not clear the local project storage."); } return; }
    if (action === "reset") { if (!window.confirm("Reset all edits and captions? Imported videos will be kept.")) return; button.disabled = true; try { const ok = await resetEdits(); if (ok) window.location.reload(); else button.disabled = false; } catch { button.disabled = false; window.alert("Could not reset the local project."); } return; }
    if (action === "duplicate") { button.disabled = true; try { const loaded = await loadProject(); if (!loaded) { button.disabled = false; return; } await saveProject(loaded.snapshot, Object.entries(loaded.files).map(([id, file]) => ({ id, file }))); const nextName = `${getName()} copy`.slice(0, 80); setName(nextName); input.value = nextName; window.dispatchEvent(new CustomEvent("phase10-status", { detail: `Project duplicated locally • ${nextName}` })); } catch { window.alert("Project duplicate failed."); } finally { button.disabled = false; } }
  });
  app.insertBefore(panel, document.querySelector(".command-bar") || null);

  ensureClipDuplicateButtons(app);
  document.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>(".clip-actions button"); if (!button) return;
    const row = button.closest<HTMLElement>(".clip-row"); if (!row) return;
    const index = Number(row.querySelector(".clip-index")?.textContent || "1") - 1;
    if (button.dataset.phase10DuplicateClip === "true") { event.preventDefault(); event.stopImmediatePropagation(); button.disabled = true; try { await duplicateClip(index); window.location.reload(); } catch { button.disabled = false; window.alert("Could not duplicate the clip locally."); } return; }
    const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>(".clip-actions button"));
    const actionIndex = buttons.indexOf(button);
    if (actionIndex === 2 && !window.confirm(`Delete clip ${index + 1}? This also removes its captions.`)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);

  document.addEventListener("dblclick", async (event) => {
    const name = (event.target as HTMLElement).closest<HTMLElement>(".clip-name"); if (!name) return;
    const row = name.closest<HTMLElement>(".clip-row"); if (!row) return;
    const index = Number(row.querySelector(".clip-index")?.textContent || "1") - 1;
    try { await renameClip(index); window.location.reload(); } catch { window.alert("Could not rename the clip locally."); }
  });

  const observer = new MutationObserver(() => { ensureClipDuplicateButtons(app); const currentName = getName(); if (document.activeElement !== input && input.value !== currentName) input.value = currentName; });
  observer.observe(app, { childList: true, subtree: true });
  window.addEventListener("phase10-status", (event) => { const detail = (event as CustomEvent<string>).detail; const status = document.querySelector("footer"); if (status && detail) status.textContent = `${detail} • Saved locally`; });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else window.setTimeout(install, 0);
export const PHASE10_CONTRACT = "Project naming, new/reset workflow, duplicate current project checkpoint, clip rename/duplicate support, and destructive-action confirmation remain local-only.";
