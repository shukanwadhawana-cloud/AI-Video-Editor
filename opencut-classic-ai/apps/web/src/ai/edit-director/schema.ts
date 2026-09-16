import { z } from "zod";
export const EDIT_PLAN_SCHEMA_VERSION = 1 as const;
export const mediaTimeSchema = z.number().int().nonnegative();
export const EDIT_TYPES = [
	"broll","ai_broll","graphic","diagram","callout","keyword_emphasis","caption_emphasis",
	"zoom_in","zoom_out","punch_in","punch_out","lower_third","transition","sfx","music","screen_insert",
] as const;
export type EditType = (typeof EDIT_TYPES)[number];
const base = {
	id: z.string().min(1), start: mediaTimeSchema, end: mediaTimeSchema,
	priority: z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(5)]),
	reason: z.string().min(1), confidence: z.number().min(0).max(1).optional(),
	sourceSegmentId: z.string().optional(), sourceWordId: z.string().optional(),
	target: z.enum(["overlay","caption","audio_overlay","effect"]).default("overlay"),
};
export const editInstructionSchema = z.discriminatedUnion("type", [
	z.object({ ...base, type: z.literal("broll"), metadata: z.object({ prompt: z.string(), fit: z.enum(["cover","contain","fill"]).default("cover"), assetHint: z.string().optional() }) }),
	z.object({ ...base, type: z.literal("ai_broll"), metadata: z.object({ prompt: z.string(), aspectRatio: z.string().optional(), style: z.string().optional() }) }),
	z.object({ ...base, type: z.literal("graphic"), metadata: z.object({ graphicKind: z.string(), label: z.string().optional(), content: z.string().optional() }) }),
	z.object({ ...base, type: z.literal("diagram"), metadata: z.object({ topic: z.string(), elements: z.array(z.string()).default([]), style: z.string().optional(), layout: z.enum(["process","timeline","comparison","flow"]).optional() }) }),
	z.object({ ...base, type: z.literal("callout"), metadata: z.object({ text: z.string(), placement: z.enum(["left","right","top","bottom","center"]).default("right") }) }),
	z.object({ ...base, type: z.literal("keyword_emphasis"), metadata: z.object({ keyword: z.string(), style: z.enum(["highlight","underline","scale","color"]).default("highlight") }) }),
	z.object({ ...base, type: z.literal("caption_emphasis"), metadata: z.object({ text: z.string(), style: z.enum(["bold","color","outline"]).default("bold") }) }),
	z.object({ ...base, type: z.literal("zoom_in"), metadata: z.object({ fromScale: z.number().positive().default(1), toScale: z.number().positive(), easing: z.enum(["linear","ease_in","ease_out","ease_in_out"]).default("ease_in_out") }) }),
	z.object({ ...base, type: z.literal("zoom_out"), metadata: z.object({ fromScale: z.number().positive().default(1), toScale: z.number().positive(), easing: z.enum(["linear","ease_in","ease_out","ease_in_out"]).default("ease_in_out") }) }),
	z.object({ ...base, type: z.literal("punch_in"), metadata: z.object({ fromScale: z.number().positive().default(1), toScale: z.number().positive(), easing: z.enum(["linear","ease_in","ease_out","ease_in_out"]).default("ease_in_out") }) }),
	z.object({ ...base, type: z.literal("punch_out"), metadata: z.object({ fromScale: z.number().positive().default(1), toScale: z.number().positive(), easing: z.enum(["linear","ease_in","ease_out","ease_in_out"]).default("ease_in_out") }) }),
	z.object({ ...base, type: z.literal("lower_third"), metadata: z.object({ title: z.string(), subtitle: z.string().optional() }) }),
	z.object({ ...base, type: z.literal("transition"), metadata: z.object({ transitionKind: z.enum(["cut","dissolve","fade","wipe"]).default("dissolve") }) }),
	z.object({ ...base, type: z.literal("sfx"), metadata: z.object({ sfxHint: z.string(), volume: z.number().min(0).max(1).default(0.5) }) }),
	z.object({ ...base, type: z.literal("music"), metadata: z.object({ mood: z.string().optional(), volume: z.number().min(0).max(1).default(0.15), ducking: z.boolean().default(true) }) }),
	z.object({ ...base, type: z.literal("screen_insert"), metadata: z.object({ description: z.string() }) }),
]);
export type EditInstruction = z.infer<typeof editInstructionSchema>;
export const editPlanSchema = z.object({
	schemaVersion: z.literal(EDIT_PLAN_SCHEMA_VERSION),
	id: z.string().min(1), createdAt: z.string().min(1),
	source: z.object({ fps: z.object({ numerator: z.number().int().positive(), denominator: z.number().int().positive() }), durationTicks: mediaTimeSchema, transcriptId: z.string().min(1) }),
	edits: z.array(editInstructionSchema),
	providerId: z.string().optional(),
	densityProfile: z.enum(["sparse","balanced","dense"]).default("balanced"),
});
export type EditPlan = z.infer<typeof editPlanSchema>;
