# Captions panel — AI Edit button

Add imports:
```ts
import { runAiEditInEditor, getTranscriptFromProject } from "@/ai/edit-orchestrator/run-ai-edit-live";
import { toast } from "sonner";
```

Add handler:
```ts
const handleAiEdit = () => {
  try {
    const transcript = getTranscriptFromProject({ editor });
    const result = runAiEditInEditor({ editor, transcript });
    if (result.status === "no_transcript" || result.status === "empty") {
      toast.message(result.message);
      return;
    }
    if (result.status === "validation_failed") {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "AI Edit failed");
  }
};
```

Add button under Generate transcript:
```tsx
<Button type="button" variant="outline" className="w-full" onClick={handleAiEdit} disabled={isProcessing}>
  AI Edit
</Button>
```
