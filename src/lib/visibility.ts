// Pure visibility logic for composition curves on the analysis chart.
// Tri-state pattern: per-tag override can force-show or force-hide regardless
// of the global default-visible-rules.
//
// Extracted from the legacy +page.svelte monolith so it can be unit-tested.

export type Override = boolean | undefined;

export interface VisibilityContext {
	tagsWithIdeal: ReadonlySet<string>;
	gameFilterActive: boolean;
	hiddenIdealsByTag: Readonly<Record<string, Override>>;
	hiddenActualsByTag: Readonly<Record<string, Override>>;
	hiddenIdealsByCategory: Readonly<Record<string, Override>>;
	hiddenActualsByCategory: Readonly<Record<string, Override>>;
	tagInGameFilter: (tag: string) => boolean;
}

export function isIdealVisible(ctx: VisibilityContext, tag: string): boolean {
	if (!ctx.tagsWithIdeal.has(tag)) return false;
	const override = ctx.hiddenIdealsByTag[tag];
	if (override === true) return false;
	if (override === false) return true;
	if (ctx.gameFilterActive) return false;
	return ctx.tagInGameFilter(tag);
}

export function isActualVisible(ctx: VisibilityContext, tag: string): boolean {
	const override = ctx.hiddenActualsByTag[tag];
	if (override === true) return false;
	if (override === false) return true;
	return ctx.tagInGameFilter(tag);
}

export function isCategoryIdealVisible(ctx: VisibilityContext, category: string): boolean {
	const override = ctx.hiddenIdealsByCategory[category];
	if (override === true) return false;
	return true;
}

export function isCategoryActualVisible(ctx: VisibilityContext, category: string): boolean {
	const override = ctx.hiddenActualsByCategory[category];
	if (override === true) return false;
	if (override === false) return true;
	return !ctx.gameFilterActive;
}

export interface TagIdealRenderOptions {
	globalHideIdeals: boolean;
	isEditing: boolean;
}

export function isTagIdealRendered(
	ctx: VisibilityContext,
	tag: string,
	options: TagIdealRenderOptions
): boolean {
	if (!ctx.tagsWithIdeal.has(tag)) return false;
	if (ctx.hiddenIdealsByTag[tag] === true) return false;
	if (options.isEditing) return true;
	if (options.globalHideIdeals) return false;
	return isIdealVisible(ctx, tag);
}
