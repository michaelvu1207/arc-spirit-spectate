import type { PlayerSnapshot, MatAsset, MatSlotSnapshot } from '$lib/types';

export type SpiritAugmentRowEntry = {
	key: string;
	name: string;
	imageUrl: string | null;
	location: string;
};

function isSpiritAugmentSlot(slot: MatSlotSnapshot): boolean {
	if (!slot?.hasRune) return false;
	const type = typeof slot.type === 'string' ? slot.type.toLowerCase() : null;
	return type === 'class' || Boolean(slot.classId);
}

function assetName(id: string | undefined, fallback: string | undefined, matAssets: Map<string, MatAsset>) {
	if (fallback?.trim()) return fallback;
	if (id) return matAssets.get(id)?.name ?? id;
	return 'Spirit Augment';
}

function assetImageUrl(
	id: string | undefined,
	matAssets: Map<string, MatAsset>,
	toStorageUrl: (path: string | null) => string | null
) {
	return id ? toStorageUrl(matAssets.get(id)?.icon_path ?? null) : null;
}

export function buildSpiritAugmentRow(
	player: PlayerSnapshot | null,
	matAssets: Map<string, MatAsset>,
	toStorageUrl: (path: string | null) => string | null
): SpiritAugmentRowEntry[] {
	if (!player) return [];

	const inventory = (player.mats ?? [])
		.filter((slot) => isSpiritAugmentSlot(slot))
		.map((slot, index) => ({
			key: `inventory:${slot.id ?? slot.name ?? 'augment'}:${slot.slotIndex}:${index}`,
			name: assetName(slot.id, slot.name, matAssets),
			imageUrl: assetImageUrl(slot.id, matAssets, toStorageUrl),
			location: 'Inventory'
		}));

	const attached = (player.spiritAugmentAttachments ?? [])
		.filter((attachment) => Boolean(attachment?.className) || Boolean(attachment?.classId))
		.map((attachment, index) => {
			const asset = attachment.runeId ? matAssets.get(attachment.runeId) : null;
			return {
				key: `attached:${attachment.runeId ?? 'augment'}:${attachment.spiritSlotIndex}:${index}`,
				name: attachment.name ?? asset?.name ?? attachment.className ?? attachment.runeId ?? 'Spirit Augment',
				imageUrl: assetImageUrl(attachment.runeId, matAssets, toStorageUrl),
				location: `Spirit ${attachment.spiritSlotIndex}`
			};
		});

	return [...inventory, ...attached];
}
