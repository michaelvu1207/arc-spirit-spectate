import type { PlayerSnapshot, RuneAsset, RuneSlotSnapshot } from '$lib/types';

export type SpiritAugmentRowEntry = {
	key: string;
	name: string;
	imageUrl: string | null;
	location: string;
};

function isSpiritAugmentSlot(slot: RuneSlotSnapshot, runeAssets: Map<string, RuneAsset>): boolean {
	if (!slot?.hasRune) return false;
	const type = typeof slot.type === 'string' ? slot.type.toLowerCase() : null;
	const asset = slot.id ? runeAssets.get(slot.id) : null;
	return type === 'class' || Boolean(slot.classId) || Boolean(asset?.class_id);
}

function assetName(id: string | undefined, fallback: string | undefined, runeAssets: Map<string, RuneAsset>) {
	if (fallback?.trim()) return fallback;
	if (id) return runeAssets.get(id)?.name ?? id;
	return 'Spirit Augment';
}

function assetImageUrl(
	id: string | undefined,
	runeAssets: Map<string, RuneAsset>,
	toStorageUrl: (path: string | null) => string | null
) {
	return id ? toStorageUrl(runeAssets.get(id)?.icon_path ?? null) : null;
}

export function buildSpiritAugmentRow(
	player: PlayerSnapshot | null,
	runeAssets: Map<string, RuneAsset>,
	toStorageUrl: (path: string | null) => string | null
): SpiritAugmentRowEntry[] {
	if (!player) return [];

	const inventory = (player.runes ?? [])
		.filter((slot) => isSpiritAugmentSlot(slot, runeAssets))
		.map((slot, index) => ({
			key: `inventory:${slot.id ?? slot.name ?? 'augment'}:${slot.slotIndex}:${index}`,
			name: assetName(slot.id, slot.name, runeAssets),
			imageUrl: assetImageUrl(slot.id, runeAssets, toStorageUrl),
			location: 'Inventory'
		}));

	const attached = (player.spiritRuneAttachments ?? [])
		.filter((attachment) => {
			const asset = attachment?.runeId ? runeAssets.get(attachment.runeId) : null;
			return !asset || Boolean(asset.class_id);
		})
		.map((attachment, index) => {
			const asset = attachment.runeId ? runeAssets.get(attachment.runeId) : null;
			return {
				key: `attached:${attachment.runeId ?? 'augment'}:${attachment.spiritSlotIndex}:${index}`,
				name: asset?.name ?? attachment.runeId ?? 'Spirit Augment',
				imageUrl: assetImageUrl(attachment.runeId, runeAssets, toStorageUrl),
				location: `Spirit ${attachment.spiritSlotIndex}`
			};
		});

	return [...inventory, ...attached];
}
