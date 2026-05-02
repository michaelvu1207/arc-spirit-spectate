<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { STORAGE_BASE_URL } from '$lib/supabase';
	import {
		getAssetState,
		getCustomDiceAsset,
		getGuardianAsset,
		getSpiritAsset,
		loadAssets
	} from '$lib/stores/assetStore.svelte';
	import { SEAT_COLORS, type SeatColor, type SpectatorProjection } from '$lib/play/types';

	interface Props {
		projection: SpectatorProjection;
		focusSeatColor?: SeatColor | null;
		immersive?: boolean;
		tableSettings?: TableSceneSettings;
		placementEditorEnabled?: boolean;
		onFlipSpirit?: ((slotIndex: number) => void) | null;
		onFlipPotentialToken?: ((slotIndex: number) => void) | null;
		onSpiritSlotMoved?: ((payload: { slotIndex: number; localX: number; localZ: number }) => void) | null;
		onMoveMatObject?: ((payload: {
			objectType: 'die' | 'item';
			instanceId: string;
			localX: number;
			localZ: number;
		}) => void) | null;
	}

	export type SpiritSlotPlacement = { x: number; z: number };
	export type MatTokenPlacement = { x: number; z: number; scale: number };

	export type TableSceneSettings = {
		hexRadius: number;
		spiritSlots: Record<number, SpiritSlotPlacement>;
		corruptionStatusToken: MatTokenPlacement;
		lighting: {
			ambientIntensity: number;
			keyIntensity: number;
			fillIntensity: number;
			overheadIntensity: number;
			overheadHeight: number;
			overheadAngle: number;
		};
	};

	const SPIRIT_WORLD_BOARD_URL =
		'https://gvxfokbptelmvvlxbigh.supabase.co/storage/v1/object/public/game_assets/spirit_world/spirit_world_with_rewards.jpg?cb=1777150015453';
	const GUARDIAN_MAT_URLS: Record<string, string> = {
		Bubblepop:
			'https://gvxfokbptelmvvlxbigh.supabase.co/storage/v1/render/image/public/game_assets/guardians/fd8557f7-1cdc-4dde-9941-42b171992432/guardian_bubblepop_image_mat.png?quality=80',
		Lumina:
			'https://gvxfokbptelmvvlxbigh.supabase.co/storage/v1/render/image/public/game_assets/guardians/20ec3d5d-3fd8-4b5b-b75b-127acb325fff/guardian_lumina_image_mat.png?quality=80',
		Embers:
			'https://gvxfokbptelmvvlxbigh.supabase.co/storage/v1/render/image/public/game_assets/guardians/20112149-c8df-48b6-b508-5e9c39e87fc2/guardian_embers_image_mat.png?quality=80',
		Pixia:
			'https://gvxfokbptelmvvlxbigh.supabase.co/storage/v1/render/image/public/game_assets/guardians/8ce23995-bb31-4be8-8fd6-fda19d1f430a/guardian_pixia_image_mat.png?quality=80',
		Myrtle:
			'https://gvxfokbptelmvvlxbigh.supabase.co/storage/v1/render/image/public/game_assets/guardians/3267074b-4f61-457c-b406-12ccf43d068a/guardian_myrtle_image_mat.png?quality=80',
		Prox:
			'https://gvxfokbptelmvvlxbigh.supabase.co/storage/v1/render/image/public/game_assets/guardians/c17484dc-741b-4e9b-9ece-6581c2095fe1/guardian_prox_image_mat.png?quality=80'
	};
	const BARRIER_TOKEN_URL = `${STORAGE_BASE_URL}/icons/ad99e440-9642-49ed-b9a9-2fc8d2480467/arcane_barrier.png`;
	const BLOOD_TOKEN_URL = `${STORAGE_BASE_URL}/icons/96f603b9-5542-4fad-b436-274a6fe19791/3blood.png`;
	const DEFENSE_DICE_URL = `${STORAGE_BASE_URL}/misc_assets/a3e10c1d-bba0-447e-b10b-45bb7b79d582/D12.png`;
	const BOARD_ASPECT = 8400 / 3600;
	const MAT_ASPECT = 3000 / 1450;
	const BOARD_HEIGHT = 10;
	const BOARD_WIDTH = BOARD_HEIGHT * BOARD_ASPECT;
	const MAT_LONG = BOARD_HEIGHT;
	const MAT_SHORT = MAT_LONG / MAT_ASPECT;
	const MAT_GAP = 1.1;
	const TABLE_WIDTH = 42;
	const TABLE_HEIGHT = 28;
	const MOVE_SPEED = 10;
	const SPRINT_SPEED = 18;
	const LONG_SIDE_PAIR_OFFSET = 6.2;
	const HEX_SPIRIT_RADIUS = 0.81;
	const HEX_SPIRIT_THICKNESS = 0.08;
	const HEX_SPIRIT_DRAG_LIFT = 0.18;
	const MAT_DEPTH = 0.12;
	const MAT_BASE_Y = 0.14;
	const SQRT3 = Math.sqrt(3);
	const MAT_TTS_SCALE_X = 2.3;
	const MAT_TTS_SCALE_Z = 1.95;
	const MAT_TTS_OFFSET_X = -5.1973;
	const MAT_TTS_OFFSET_Y = 0.25975;
	const SPIRIT_SLOT_TTS_POSITIONS: Record<number, { x: number; z: number }> = {
		1: { x: 1.629, z: 0.519 },
		2: { x: 1.611, z: -0.247 },
		3: { x: 1.047, z: -0.638 },
		4: { x: 0.499, z: -0.26 },
		5: { x: 0.491, z: 0.502 },
		6: { x: 1.049, z: 0.127 },
		7: { x: 1.052, z: 0.908 }
	};
	export const DEFAULT_TABLE_SCENE_SETTINGS: TableSceneSettings = {
		hexRadius: HEX_SPIRIT_RADIUS,
		spiritSlots: SPIRIT_SLOT_TTS_POSITIONS,
		corruptionStatusToken: { x: 0.05, z: -1.13, scale: 2 },
		lighting: {
			ambientIntensity: 1.35,
			keyIntensity: 0.7,
			fillIntensity: 2.7,
			overheadIntensity: 11,
			overheadHeight: 14,
			overheadAngle: 0.78
		}
	};
	const RUNE_SLOT_TTS_POSITIONS = [
		{ x: 0.176, z: -0.034 },
		{ x: 0.013, z: -0.279 },
		{ x: -0.141, z: -0.515 },
		{ x: -0.284, z: -0.764 }
	] as const;
	const BARRIER_SLOT_TTS_POSITIONS = [
		-1.868,
		-1.673,
		-1.478,
		-1.283,
		-1.088,
		-0.894,
		-0.699,
		-0.504,
		-0.309,
		-0.114
	].map((x) => ({ x, z: 0.857 }));
	const DEMO_SPIRIT_SAMPLES = [
		{
			id: 'e368f98d-fa19-47b0-bb54-1dd26d902b23',
			name: 'Dandelion',
			slotIndex: 6
		},
		{
			id: '3b196b06-a047-4505-aad6-bf0c9fe05ac0',
			name: 'Rootguard',
			slotIndex: 4
		},
		{
			id: 'd19f66b7-787b-4c5b-b498-e1f8fb7688e0',
			name: 'Flower Fighter',
			slotIndex: 1
		}
	] as const;

	type SceneSpiritVisual = {
		id: string;
		name: string;
		seatColor: SeatColor;
		slotIndex: number;
		frontUrl: string;
		backUrl: string;
		isFaceDown: boolean;
	};
		type SceneDieVisual = {
			instanceId: string;
			seatColor: SeatColor;
			diceId: string;
			name: string;
			diceType: 'attack' | 'special' | 'defense';
			localX: number;
			localZ: number;
			faceIndex: number;
			rollRotation: {
				x: number;
				y: number;
				z: number;
			};
			textureUrl: string | null;
			faceUrls: Array<string | null>;
		};
	type SceneItemVisual = {
		instanceId: string;
		seatColor: SeatColor;
		runeId: string;
		name: string;
		kind: 'rune' | 'augment' | 'relic';
		localX: number;
		localZ: number;
		textureUrl: string | null;
	};
	type SceneStatusTokenVisual = {
		seatColor: SeatColor;
		level: number;
		name: string;
		textureUrl: string | null;
	};

	let {
		projection,
		focusSeatColor = null,
		immersive = false,
		tableSettings = DEFAULT_TABLE_SCENE_SETTINGS,
		placementEditorEnabled = false,
		onFlipSpirit = null,
		onFlipPotentialToken = null,
		onSpiritSlotMoved = null,
		onMoveMatObject = null
	}: Props = $props();

	const assetState = getAssetState();

	let host = $state<HTMLDivElement | null>(null);
	let renderer: import('three').WebGLRenderer | null = null;
	let scene: import('three').Scene | null = null;
	let camera: import('three').PerspectiveCamera | null = null;
	let controls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null = null;
	let animationFrame = 0;
	let resizeHandler: (() => void) | null = null;
	let keyDownHandler: ((event: KeyboardEvent) => void) | null = null;
	let keyUpHandler: ((event: KeyboardEvent) => void) | null = null;
	let blurHandler: (() => void) | null = null;
	let pointerDownHandler: ((event: PointerEvent) => void) | null = null;
	let pointerMoveHandler: ((event: PointerEvent) => void) | null = null;
	let pointerUpHandler: (() => void) | null = null;
	let syncSpiritScene: (() => void) | null = null;
	let syncTableLighting: (() => void) | null = null;
	const activeKeys = new Set<string>();
	const textureCache = new Map<string, import('three').Texture>();

	const activeSeats = $derived(projection.activeSeats ?? []);
	const focusSeat = $derived(
		focusSeatColor ?? projection.viewer.seatColor ?? activeSeats[0] ?? SEAT_COLORS[0]
	);
	const sceneBuildKey = $derived.by(() => {
		void assetState.isLoaded;
			return [
				projection.roomCode,
				projection.status,
				activeSeats.join(','),
				assetState.isLoaded ? 'assets-ready' : 'assets-pending'
			].join('|');
		});
		const spiritStateKey = $derived.by(() => {
			return [projection.roomCode, projection.revision, focusSeat ?? 'none'].join('|');
		});
		const spiritPlacementKey = $derived.by(() => {
			return JSON.stringify({
				hexRadius: tableSettings.hexRadius,
				spiritSlots: tableSettings.spiritSlots,
				corruptionStatusToken: tableSettings.corruptionStatusToken
			});
		});
		const lightingKey = $derived.by(() => JSON.stringify(tableSettings.lighting));

	function seatAssignment(index: number): SeatColor | null {
		return SEAT_COLORS[index] ?? null;
	}

	function getGuardianMatUrl(guardianName: string | null | undefined) {
		if (!guardianName) return null;
		const asset = getGuardianAsset(guardianName);
		return asset?.matUrl ?? GUARDIAN_MAT_URLS[guardianName] ?? null;
	}

	function getSpiritFrontUrl(spiritId: string): string | null {
		const asset = getSpiritAsset(spiritId);
		if (asset?.imageUrl) return asset.imageUrl;
		return `${STORAGE_BASE_URL}/hex_spirits/${spiritId}_game_print.png`;
	}

	function getSpiritBackUrl(spiritId: string): string {
		return `${STORAGE_BASE_URL}/hex_spirits/${spiritId}_back_side_export.png`;
	}

	function getDiceTextureUrl(diceId: string): string | null {
		if (diceId === 'defense_dice') return DEFENSE_DICE_URL;
		const asset = getCustomDiceAsset(diceId);
		if (asset?.exported_template_path) return `${STORAGE_BASE_URL}/${asset.exported_template_path}`;
		if (asset?.background_image_path) return `${STORAGE_BASE_URL}/${asset.background_image_path}`;
		return null;
	}

	function getDiceFaceTextureUrls(diceId: string): Array<string | null> {
		const asset = getCustomDiceAsset(diceId);
		if (!asset?.sides?.length) return [];
		return asset.sides
			.slice()
			.sort((a, b) => a.side_number - b.side_number)
			.map((side) =>
				side.image_path
					? side.image_path.startsWith('http')
						? side.image_path
						: `${STORAGE_BASE_URL}/${side.image_path}`
					: null
			);
	}

	function getRuneTextureUrl(runeId: string): string | null {
		const asset = assetState.runeAssets.get(runeId);
		if (!asset?.icon_path) return null;
		return asset.icon_path.startsWith('http') ? asset.icon_path : `${STORAGE_BASE_URL}/${asset.icon_path}`;
	}

	function statusKeyForLevel(level: number): string {
		if (level <= 1) return 'purified';
		if (level === 2) return 'tainted';
		if (level === 3) return 'corrupt';
		return 'fallen';
	}

	function getStatusTokenTextureUrl(level: number, tokenName: string | null | undefined): string | null {
		const preferredKey = tokenName?.toLowerCase().replace(/^pure$/, 'purified') ?? statusKeyForLevel(level);
		const icon = assetState.statusIcons.get(preferredKey) ?? assetState.statusIcons.get(statusKeyForLevel(level));
		if (!icon?.file_path) return null;
		return icon.file_path.startsWith('http') ? icon.file_path : `${STORAGE_BASE_URL}/${icon.file_path}`;
	}

	function mapTtsLocalToMat(ttsX: number, ttsZ: number) {
		return {
			x: MAT_TTS_OFFSET_X + ttsX * MAT_TTS_SCALE_X,
			y: MAT_TTS_OFFSET_Y - ttsZ * MAT_TTS_SCALE_Z
		};
	}

	function mapMatToTtsLocal(localX: number, localY: number) {
		return {
			x: (localX - MAT_TTS_OFFSET_X) / MAT_TTS_SCALE_X,
			z: (MAT_TTS_OFFSET_Y - localY) / MAT_TTS_SCALE_Z
		};
	}

	function buildSceneSpirits(): SceneSpiritVisual[] {
		const spirits: SceneSpiritVisual[] = [];

		for (const seatColor of activeSeats) {
			const player = projection.players[seatColor];
			if (!player?.spirits?.length) continue;

			for (const spirit of player.spirits) {
				const frontUrl = getSpiritFrontUrl(spirit.id);
				if (!frontUrl) continue;
				spirits.push({
					id: spirit.id,
					name: spirit.name,
					seatColor,
					slotIndex: spirit.slotIndex,
					frontUrl,
					backUrl: getSpiritBackUrl(spirit.id),
					isFaceDown: spirit.isFaceDown ?? false
				});
			}
		}

		if (spirits.length > 0) return spirits;

		const demoSeat = focusSeat ?? activeSeats[0] ?? null;
		if (!demoSeat) return spirits;

		for (const spirit of DEMO_SPIRIT_SAMPLES) {
			const frontUrl = getSpiritFrontUrl(spirit.id);
			if (!frontUrl) continue;
			spirits.push({
				id: spirit.id,
				name: spirit.name,
				seatColor: demoSeat,
				slotIndex: spirit.slotIndex,
				frontUrl,
				backUrl: getSpiritBackUrl(spirit.id),
				isFaceDown: false
			});
		}

		return spirits;
	}

	function buildSceneDice(): SceneDieVisual[] {
		const dice: SceneDieVisual[] = [];
		for (const seatColor of activeSeats) {
			const player = projection.players[seatColor];
			if (!player?.spawnedDice?.length) continue;
			for (const die of player.spawnedDice) {
				dice.push({
					...die,
					seatColor,
					textureUrl: getDiceTextureUrl(die.diceId),
					faceUrls: getDiceFaceTextureUrls(die.diceId)
				});
			}
		}
		return dice;
	}

	function buildSceneItems(): SceneItemVisual[] {
		const items: SceneItemVisual[] = [];
		for (const seatColor of activeSeats) {
			const player = projection.players[seatColor];
			if (!player?.spawnedItems?.length) continue;
			for (const item of player.spawnedItems) {
				items.push({
					...item,
					seatColor,
					textureUrl: getRuneTextureUrl(item.runeId)
				});
			}
		}
		return items;
	}

		function buildSceneStatusTokens(): SceneStatusTokenVisual[] {
		const tokens: SceneStatusTokenVisual[] = [];
		for (const seatColor of activeSeats) {
			const player = projection.players[seatColor];
			if (!player) continue;
			tokens.push({
				seatColor,
				level: player.statusLevel,
				name: player.statusToken ?? statusKeyForLevel(player.statusLevel),
				textureUrl: getStatusTokenTextureUrl(player.statusLevel, player.statusToken)
			});
		}
			return tokens;
		}

		function cubeRotationForFace(faceIndex: number, rollY: number) {
			const face = ((Math.floor(faceIndex) % 6) + 6) % 6;
			const yaw = rollY % (Math.PI * 2);
			if (face === 0) return { x: 0, y: yaw, z: -Math.PI / 2 };
			if (face === 1) return { x: 0, y: yaw, z: Math.PI / 2 };
			if (face === 2) return { x: 0, y: yaw, z: 0 };
			if (face === 3) return { x: Math.PI, y: yaw, z: 0 };
			if (face === 4) return { x: Math.PI / 2, y: yaw, z: 0 };
			return { x: -Math.PI / 2, y: yaw, z: 0 };
		}

	function getMatLocalSpiritPosition(slotIndex: number) {
		const position = tableSettings.spiritSlots[slotIndex] ?? SPIRIT_SLOT_TTS_POSITIONS[slotIndex] ?? SPIRIT_SLOT_TTS_POSITIONS[4];
		return mapTtsLocalToMat(position.x, position.z);
	}

	function teardownScene() {
		if (browser) {
			cancelAnimationFrame(animationFrame);
			if (resizeHandler) {
				window.removeEventListener('resize', resizeHandler);
				resizeHandler = null;
			}
			if (keyDownHandler) {
				window.removeEventListener('keydown', keyDownHandler);
				keyDownHandler = null;
			}
			if (keyUpHandler) {
				window.removeEventListener('keyup', keyUpHandler);
				keyUpHandler = null;
			}
			if (blurHandler) {
				window.removeEventListener('blur', blurHandler);
				blurHandler = null;
			}
			if (pointerDownHandler && renderer) {
				renderer.domElement.removeEventListener('pointerdown', pointerDownHandler);
				pointerDownHandler = null;
			}
			if (pointerMoveHandler && renderer) {
				renderer.domElement.removeEventListener('pointermove', pointerMoveHandler);
				pointerMoveHandler = null;
			}
			if (pointerUpHandler) {
				window.removeEventListener('pointerup', pointerUpHandler);
				pointerUpHandler = null;
			}
		}
			activeKeys.clear();
			syncSpiritScene = null;
			syncTableLighting = null;
			controls?.dispose();
		renderer?.dispose();
		if (host) host.innerHTML = '';
		renderer = null;
		scene = null;
		camera = null;
		controls = null;
	}

	async function buildScene() {
		if (!browser || !host || renderer) return;

		const THREE = await import('three');
		const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
		if (!host || renderer) return;
		const hostElement = host;
		const movementClock = new THREE.Clock();
		const upAxis = new THREE.Vector3(0, 1, 0);
		const forward = new THREE.Vector3();
		const right = new THREE.Vector3();
		const movement = new THREE.Vector3();
		const raycaster = new THREE.Raycaster();
		const pointer = new THREE.Vector2();
		const dragPoint = new THREE.Vector3();
		const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
		const matSurfacesBySeat = new Map<SeatColor, import('three').Mesh>();
		const draggableTargets: import('three').Object3D[] = [];
		let selectedSpirit: import('three').Group | null = null;
		let activeDrag:
			| {
					group: import('three').Group;
					offset: import('three').Vector3;
					restY: number;
					objectType: 'spirit' | 'die' | 'item';
					seatColor: SeatColor;
					instanceId?: string;
			  }
			| null = null;

		const setSelectedSpirit = (group: import('three').Group | null) => {
			if (selectedSpirit === group) return;
			if (selectedSpirit) {
				selectedSpirit.scale.setScalar(1);
			}
			selectedSpirit = group;
			if (selectedSpirit) {
				selectedSpirit.scale.setScalar(1.06);
			}
		};

		const createHexSpiritGeometries = () => {
			const hexRadius = Math.max(0.25, Math.min(1.4, tableSettings.hexRadius));
			const hexShape = new THREE.Shape();
			const hexPoints: Array<[number, number]> = [
				[hexRadius, 0],
				[hexRadius / 2, hexRadius * SQRT3 * 0.5],
				[-hexRadius / 2, hexRadius * SQRT3 * 0.5],
				[-hexRadius, 0],
				[-hexRadius / 2, -hexRadius * SQRT3 * 0.5],
				[hexRadius / 2, -hexRadius * SQRT3 * 0.5]
			];
			hexShape.moveTo(hexPoints[0][0], hexPoints[0][1]);
			for (let index = 1; index < hexPoints.length; index += 1) {
				hexShape.lineTo(hexPoints[index][0], hexPoints[index][1]);
			}
			hexShape.closePath();

			const topFaceGeometry = new THREE.ShapeGeometry(hexShape);
			const topPositions = topFaceGeometry.getAttribute('position');
			const topUvs = new Float32Array(topPositions.count * 2);
			for (let index = 0; index < topPositions.count; index += 1) {
				const x = topPositions.getX(index);
				const y = topPositions.getY(index);
				topUvs[index * 2] = (x + hexRadius) / (hexRadius * 2);
				topUvs[index * 2 + 1] =
					(y + hexRadius * SQRT3 * 0.5) / (hexRadius * SQRT3);
			}
			topFaceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(topUvs, 2));

			const sideGeometry = new THREE.CylinderGeometry(
				hexRadius,
				hexRadius,
				HEX_SPIRIT_THICKNESS,
				6,
				1,
				true
			);
			sideGeometry.rotateY(Math.PI / 6);

			return { sideGeometry, topFaceGeometry };
		};

		scene = new THREE.Scene();
		scene.background = new THREE.Color('#0a0614');
		scene.fog = new THREE.FogExp2('#090512', 0.018);

		camera = new THREE.PerspectiveCamera(
			46,
			hostElement.clientWidth / hostElement.clientHeight,
			0.1,
			200
		);
		camera.position.set(0, 22, 22);

		renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(hostElement.clientWidth, hostElement.clientHeight);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		hostElement.innerHTML = '';
		hostElement.appendChild(renderer.domElement);

		controls = new OrbitControls(camera, renderer.domElement);
		controls.target.set(0, 0.4, 0);
		controls.enablePan = false;
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.minDistance = 5;
		controls.maxDistance = 52;
		controls.maxPolarAngle = Math.PI / 2.002;
		controls.minPolarAngle = 0.01;
		controls.update();

		const ambient = new THREE.AmbientLight('#bbaeff', tableSettings.lighting.ambientIntensity);
		scene.add(ambient);

		const keyLight = new THREE.DirectionalLight('#f9cbff', tableSettings.lighting.keyIntensity);
		keyLight.position.set(-10, 20, 12);
		keyLight.castShadow = true;
		keyLight.shadow.mapSize.set(2048, 2048);
		scene.add(keyLight);

		const fillLight = new THREE.DirectionalLight('#73d9ff', tableSettings.lighting.fillIntensity);
		fillLight.position.set(12, 14, -10);
		scene.add(fillLight);

		const overheadLight = new THREE.SpotLight(
			'#fff1c7',
			tableSettings.lighting.overheadIntensity,
			70,
			tableSettings.lighting.overheadAngle,
			0.45,
			1.1
		);
		overheadLight.position.set(0, tableSettings.lighting.overheadHeight, 0);
		overheadLight.target.position.set(0, 0, 0);
		overheadLight.castShadow = true;
			overheadLight.shadow.mapSize.set(1024, 1024);
			scene.add(overheadLight);
			scene.add(overheadLight.target);
			syncTableLighting = () => {
				ambient.intensity = tableSettings.lighting.ambientIntensity;
				keyLight.intensity = tableSettings.lighting.keyIntensity;
				fillLight.intensity = tableSettings.lighting.fillIntensity;
				overheadLight.intensity = tableSettings.lighting.overheadIntensity;
				overheadLight.angle = tableSettings.lighting.overheadAngle;
				overheadLight.position.set(0, tableSettings.lighting.overheadHeight, 0);
			};

			const lampStem = new THREE.Mesh(
			new THREE.CylinderGeometry(0.05, 0.05, 5.5, 12),
			new THREE.MeshStandardMaterial({
				color: '#3d3652',
				metalness: 0.45,
				roughness: 0.45
			})
		);
		lampStem.position.set(0, 16.75, 0);
		lampStem.castShadow = true;
		scene.add(lampStem);

		const lampShade = new THREE.Mesh(
			new THREE.SphereGeometry(0.42, 18, 18),
			new THREE.MeshStandardMaterial({
				color: '#fff3da',
				emissive: '#ffdd9a',
				emissiveIntensity: 1.6,
				metalness: 0.02,
				roughness: 0.3
			})
		);
		lampShade.position.set(0, 14.2, 0);
		lampShade.castShadow = true;
		scene.add(lampShade);

		const table = new THREE.Mesh(
			new THREE.BoxGeometry(TABLE_WIDTH, 1.4, TABLE_HEIGHT),
			new THREE.MeshStandardMaterial({
				color: '#1a1328',
				metalness: 0.1,
				roughness: 0.92
			})
		);
		table.position.y = -0.8;
		table.receiveShadow = true;
		table.castShadow = true;
		scene.add(table);

		const felt = new THREE.Mesh(
			new THREE.PlaneGeometry(TABLE_WIDTH - 1.1, TABLE_HEIGHT - 1.1),
			new THREE.MeshStandardMaterial({
				color: '#211238',
				metalness: 0.02,
				roughness: 0.94
			})
		);
		felt.rotation.x = -Math.PI / 2;
		felt.position.y = -0.05;
		scene.add(felt);

		const boardBase = new THREE.Mesh(
			new THREE.BoxGeometry(BOARD_WIDTH, 0.32, BOARD_HEIGHT),
			new THREE.MeshStandardMaterial({
				color: '#140d22',
				metalness: 0.08,
				roughness: 0.94
			})
		);
		boardBase.position.y = 0.18;
		boardBase.castShadow = true;
		boardBase.receiveShadow = true;
		scene.add(boardBase);

		const boardSurface = new THREE.Mesh(
			new THREE.PlaneGeometry(BOARD_WIDTH, BOARD_HEIGHT),
			new THREE.MeshStandardMaterial({
				color: '#47205e',
				metalness: 0.02,
				roughness: 0.95
			})
		);
		boardSurface.rotation.x = -Math.PI / 2;
		boardSurface.position.y = 0.36;
		boardSurface.receiveShadow = true;
		scene.add(boardSurface);

		const positions = [
			{ x: -LONG_SIDE_PAIR_OFFSET, z: BOARD_HEIGHT / 2 + MAT_SHORT / 2 + MAT_GAP, rot: Math.PI },
			{ x: LONG_SIDE_PAIR_OFFSET, z: BOARD_HEIGHT / 2 + MAT_SHORT / 2 + MAT_GAP, rot: Math.PI },
			{ x: BOARD_WIDTH / 2 + MAT_SHORT / 2 + MAT_GAP, z: 0, rot: Math.PI / 2 },
			{ x: LONG_SIDE_PAIR_OFFSET, z: -(BOARD_HEIGHT / 2 + MAT_SHORT / 2 + MAT_GAP), rot: 0 },
			{ x: -LONG_SIDE_PAIR_OFFSET, z: -(BOARD_HEIGHT / 2 + MAT_SHORT / 2 + MAT_GAP), rot: 0 },
			{ x: -(BOARD_WIDTH / 2 + MAT_SHORT / 2 + MAT_GAP), z: 0, rot: -Math.PI / 2 }
		];

		const loader = new THREE.TextureLoader();
		loader.setCrossOrigin('anonymous');

		const loadTexture = (
			url: string,
			options?: { onLoad?: (texture: import('three').Texture) => void }
		) => {
			const cached = textureCache.get(url);
			if (cached) {
				options?.onLoad?.(cached);
				return;
			}
			loader.load(
				url,
				(texture: import('three').Texture) => {
					texture.colorSpace = THREE.SRGBColorSpace;
					texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
					texture.needsUpdate = true;
					textureCache.set(url, texture);
					options?.onLoad?.(texture);
				},
				undefined,
				(error) => {
					console.warn('[TabletopScene] Failed to load texture', url, error);
				}
			);
		};

		const applyTexture = (
			mesh: import('three').Mesh,
			url: string,
			options?: { onLoad?: (texture: import('three').Texture) => void }
		) => {
			loadTexture(url, {
				onLoad: (texture) => {
					options?.onLoad?.(texture);
					mesh.material = new THREE.MeshStandardMaterial({
						map: texture,
						color: '#ffffff',
						metalness: 0.02,
						roughness: 0.94
					});
				}
			});
		};

		applyTexture(boardSurface, SPIRIT_WORLD_BOARD_URL);

		for (const [index, position] of positions.entries()) {
			const seatColor = seatAssignment(index);
			const player = seatColor ? projection.players[seatColor] ?? null : null;
			const matUrl = player ? getGuardianMatUrl(player.selectedGuardian) : null;

			const matRotation = position.rot + Math.PI;

			const matBase = new THREE.Mesh(
				new THREE.BoxGeometry(MAT_LONG, MAT_DEPTH, MAT_SHORT),
				new THREE.MeshStandardMaterial({
					color: player ? '#231833' : '#181225',
					metalness: 0.08,
					roughness: 0.9
				})
			);
			matBase.position.set(position.x, MAT_BASE_Y, position.z);
			matBase.rotation.y = matRotation;
			matBase.castShadow = true;
			matBase.receiveShadow = true;
			scene.add(matBase);

			const matSurface = new THREE.Mesh(
				new THREE.PlaneGeometry(MAT_LONG, MAT_SHORT),
				new THREE.MeshStandardMaterial({
					color: player ? '#3d244f' : '#211733',
					metalness: 0.04,
					roughness: 0.9
				})
			);
			matSurface.rotation.x = -Math.PI / 2;
			matSurface.rotation.z = matRotation;
			matSurface.position.set(position.x, MAT_BASE_Y + MAT_DEPTH / 2 + 0.002, position.z);
			matSurface.receiveShadow = true;
			scene.add(matSurface);
			if (seatColor) {
				matSurfacesBySeat.set(seatColor, matSurface);
			}

			if (matUrl) {
				applyTexture(matSurface, matUrl);
			}

			const rim = new THREE.Mesh(
				new THREE.RingGeometry(0.5, 0.62, 32),
				new THREE.MeshBasicMaterial({
					color: seatColor === focusSeat ? '#24d4ff' : '#ff5dd1',
					transparent: true,
					opacity: player ? 0.85 : 0.18,
					side: THREE.DoubleSide
				})
			);
			rim.rotation.x = -Math.PI / 2;
			rim.position.set(position.x, MAT_BASE_Y + MAT_DEPTH / 2 + 0.03, position.z);
			scene.add(rim);
		}

		const dynamicGroups: import('three').Group[] = [];
		const clearSpiritGroups = () => {
			setSelectedSpirit(null);
			draggableTargets.length = 0;
			for (const group of dynamicGroups.splice(0, dynamicGroups.length)) {
				group.traverse((object) => {
					const mesh = object as import('three').Mesh;
					mesh.geometry?.dispose();
					const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
					for (const material of materials) {
						material.dispose();
					}
				});
				scene?.remove(group);
			}
		};

		const buildSpiritGroup = (spirit: SceneSpiritVisual, matSurface: import('three').Mesh) => {
			matSurface.updateMatrixWorld(true);
			const { sideGeometry, topFaceGeometry } = createHexSpiritGeometries();
			const localSpiritPosition = getMatLocalSpiritPosition(spirit.slotIndex);
			const worldPosition = matSurface.localToWorld(
				new THREE.Vector3(localSpiritPosition.x, localSpiritPosition.y, HEX_SPIRIT_THICKNESS * 0.5 + 0.03)
			);

			const spiritGroup = new THREE.Group();
			spiritGroup.position.copy(worldPosition);
			spiritGroup.rotation.x = spirit.isFaceDown ? Math.PI : 0;
			spiritGroup.userData = {
				objectKind: 'spirit',
				spiritId: spirit.id,
				seatColor: spirit.seatColor,
				slotIndex: spirit.slotIndex
			};

			const sideMaterial = new THREE.MeshStandardMaterial({
				color: '#7b8874',
				metalness: 0.06,
				roughness: 0.82
			});
			const frontMaterial = new THREE.MeshStandardMaterial({
				color: '#ffffff',
				transparent: true,
				alphaTest: 0.25,
				metalness: 0.02,
				roughness: 0.92,
				side: THREE.DoubleSide
			});
			const backMaterial = new THREE.MeshStandardMaterial({
				color: '#ffffff',
				transparent: true,
				alphaTest: 0.25,
				metalness: 0.02,
				roughness: 0.92,
				side: THREE.DoubleSide
			});

			const sideMesh = new THREE.Mesh(sideGeometry, sideMaterial);
			sideMesh.castShadow = true;
			sideMesh.receiveShadow = true;

			const topMesh = new THREE.Mesh(topFaceGeometry, frontMaterial);
			topMesh.rotation.x = -Math.PI / 2;
			topMesh.position.y = HEX_SPIRIT_THICKNESS / 2 + 0.002;
			topMesh.castShadow = true;
			topMesh.receiveShadow = true;

			const bottomMesh = new THREE.Mesh(topFaceGeometry, backMaterial);
			bottomMesh.rotation.x = Math.PI / 2;
			bottomMesh.position.y = -HEX_SPIRIT_THICKNESS / 2 - 0.002;
			bottomMesh.castShadow = true;
			bottomMesh.receiveShadow = true;

			loadTexture(spirit.frontUrl, {
				onLoad: (texture) => {
					frontMaterial.map = texture;
					frontMaterial.needsUpdate = true;
				}
			});
			loadTexture(spirit.backUrl, {
				onLoad: (texture) => {
					backMaterial.map = texture;
					backMaterial.needsUpdate = true;
				}
			});

			spiritGroup.add(sideMesh, topMesh, bottomMesh);
			for (const target of [sideMesh, topMesh, bottomMesh]) {
				target.userData.spiritRoot = spiritGroup;
				draggableTargets.push(target);
			}

			dynamicGroups.push(spiritGroup);
			scene!.add(spiritGroup);
		};

		const buildPotentialTokenGroup = (
			seatColor: SeatColor,
			slotIndex: number,
			isBlood: boolean,
			matSurface: import('three').Mesh
		) => {
			const tokenGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.08, 28);
			const material = new THREE.MeshStandardMaterial({
				color: '#ffffff',
				metalness: 0.04,
				roughness: 0.86
			});
			const token = new THREE.Mesh(tokenGeometry, material);
			const ttsPos = BARRIER_SLOT_TTS_POSITIONS[slotIndex - 1];
			if (!ttsPos) return;
			const local = mapTtsLocalToMat(ttsPos.x, ttsPos.z);
			matSurface.updateMatrixWorld(true);
			const worldPosition = matSurface.localToWorld(new THREE.Vector3(local.x, local.y, 0.08));
			const group = new THREE.Group();
			group.position.copy(worldPosition);
			group.userData = {
				objectKind: 'potential',
				seatColor,
				slotIndex
			};
			token.userData.spiritRoot = group;
			const textureUrl = isBlood ? BLOOD_TOKEN_URL : BARRIER_TOKEN_URL;
			loadTexture(textureUrl, {
				onLoad: (texture) => {
					material.map = texture;
					material.needsUpdate = true;
				}
			});
			group.add(token);
			dynamicGroups.push(group);
			scene!.add(group);
			draggableTargets.push(token);
		};

		const buildDieGroup = (die: SceneDieVisual, matSurface: import('three').Mesh) => {
			const usesIndividualFaces = die.diceType !== 'defense' && die.faceUrls.filter(Boolean).length >= 6;
			const geometry =
				die.diceType === 'defense'
					? new THREE.DodecahedronGeometry(0.35)
					: new THREE.BoxGeometry(0.56, 0.56, 0.56);
			const faceMaterials = usesIndividualFaces
				? Array.from({ length: 6 }, () => {
						return new THREE.MeshStandardMaterial({
							color: '#ffffff',
							metalness: 0.06,
							roughness: 0.72
						});
					})
				: null;
			const fallbackMaterial = new THREE.MeshStandardMaterial({
				color: '#ffffff',
				metalness: 0.08,
				roughness: 0.62
			});
			const mesh = new THREE.Mesh(geometry, faceMaterials ?? fallbackMaterial);
			const local = mapTtsLocalToMat(die.localX, die.localZ);
			matSurface.updateMatrixWorld(true);
			const worldPosition = matSurface.localToWorld(new THREE.Vector3(local.x, local.y, 0.34));
			const group = new THREE.Group();
			group.position.copy(worldPosition);
			group.userData = {
				objectKind: 'die',
				seatColor: die.seatColor,
				instanceId: die.instanceId
				};
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				mesh.userData.spiritRoot = group;
				if (usesIndividualFaces) {
					const rotation = cubeRotationForFace(die.faceIndex, die.rollRotation.y);
					mesh.rotation.set(rotation.x, rotation.y, rotation.z);
				} else {
					mesh.rotation.set(die.rollRotation.x, die.rollRotation.y, die.rollRotation.z);
				}
				if (faceMaterials) {
				for (const [index, url] of die.faceUrls.slice(0, 6).entries()) {
					if (!url) continue;
					loadTexture(url, {
						onLoad: (texture) => {
							const material = faceMaterials[index];
							if (!material) return;
							material.map = texture;
							material.needsUpdate = true;
						}
					});
				}
			} else if (die.textureUrl) {
				loadTexture(die.textureUrl, {
					onLoad: (texture) => {
						fallbackMaterial.map = texture;
						fallbackMaterial.needsUpdate = true;
					}
				});
			}
			group.add(mesh);
			dynamicGroups.push(group);
			scene!.add(group);
			draggableTargets.push(mesh);
		};

			const buildItemGroup = (item: SceneItemVisual, matSurface: import('three').Mesh) => {
			const maxDimension = item.kind === 'augment' ? 0.58 : item.kind === 'relic' ? 0.8 : 0.62;
			const planeGeometry = new THREE.PlaneGeometry(1, 1);
			const artMaterial = new THREE.MeshBasicMaterial({
				color: '#ffffff',
				alphaTest: 0.5,
				side: THREE.DoubleSide
			});
			const local = mapTtsLocalToMat(item.localX, item.localZ);
			matSurface.updateMatrixWorld(true);
			const worldPosition = matSurface.localToWorld(new THREE.Vector3(local.x, local.y, 0.11));
			const group = new THREE.Group();
			group.position.copy(worldPosition);
			group.userData = {
				objectKind: 'item',
				seatColor: item.seatColor,
				instanceId: item.instanceId
			};
			const artMesh = new THREE.Mesh(planeGeometry, artMaterial);
			artMesh.rotation.x = -Math.PI / 2;
			artMesh.position.y = 0;
			artMesh.userData.spiritRoot = group;
			group.add(artMesh);
			draggableTargets.push(artMesh);

			if (item.textureUrl) {
				loadTexture(item.textureUrl, {
					onLoad: (texture) => {
						const image = texture.image as { width?: number; height?: number } | undefined;
						const aspect =
							image?.width && image?.height && image.height > 0 ? image.width / image.height : 1;
						const width = aspect >= 1 ? maxDimension : maxDimension * aspect;
						const height = aspect >= 1 ? maxDimension / aspect : maxDimension;
						artMesh.scale.set(width, height, 1);
						artMaterial.map = texture;
						artMaterial.needsUpdate = true;
					}
				});
			}
				dynamicGroups.push(group);
				scene!.add(group);
			};

			const buildStatusTokenGroup = (token: SceneStatusTokenVisual, matSurface: import('three').Mesh) => {
				const placement = tableSettings.corruptionStatusToken;
				const maxDimension = Math.max(0.35, tableSettings.hexRadius * 2 * placement.scale);
				const planeGeometry = new THREE.PlaneGeometry(1, 1);
				const artMaterial = new THREE.MeshBasicMaterial({
					color: '#ffffff',
					alphaTest: 0.45,
					side: THREE.DoubleSide
				});
				const local = mapTtsLocalToMat(placement.x, placement.z);
				matSurface.updateMatrixWorld(true);
				const worldPosition = matSurface.localToWorld(new THREE.Vector3(local.x, local.y, 0.14));
				const group = new THREE.Group();
				group.position.copy(worldPosition);
				group.userData = {
					objectKind: 'status-token',
					seatColor: token.seatColor,
					statusLevel: token.level
				};
				const artMesh = new THREE.Mesh(planeGeometry, artMaterial);
				artMesh.rotation.x = -Math.PI / 2;
				artMesh.position.y = 0;
				group.add(artMesh);

				if (token.textureUrl) {
					loadTexture(token.textureUrl, {
						onLoad: (texture) => {
							const image = texture.image as { width?: number; height?: number } | undefined;
							const aspect =
								image?.width && image?.height && image.height > 0 ? image.width / image.height : 1;
							const width = aspect >= 1 ? maxDimension : maxDimension * aspect;
							const height = aspect >= 1 ? maxDimension / aspect : maxDimension;
							artMesh.scale.set(width, height, 1);
							artMaterial.map = texture;
							artMaterial.needsUpdate = true;
						}
					});
				}

				dynamicGroups.push(group);
				scene!.add(group);
			};

			const syncLocalSpiritScene = () => {
				clearSpiritGroups();

			for (const seatColor of activeSeats) {
				const matSurface = matSurfacesBySeat.get(seatColor);
				const player = projection.players[seatColor];
				if (!matSurface || !player) continue;

				const maxTokens = Math.max(0, Math.min(10, player.maxTokens ?? 0));
				const blood = Math.max(0, Math.min(maxTokens, player.blood ?? 0));
				const bloodStart = maxTokens - blood + 1;
				for (let slotIndex = 1; slotIndex <= maxTokens; slotIndex += 1) {
					buildPotentialTokenGroup(seatColor, slotIndex, blood > 0 && slotIndex >= bloodStart, matSurface);
				}
			}

				for (const spirit of buildSceneSpirits()) {
					const matSurface = matSurfacesBySeat.get(spirit.seatColor);
					if (!matSurface) continue;
					buildSpiritGroup(spirit, matSurface);
				}

				for (const token of buildSceneStatusTokens()) {
					const matSurface = matSurfacesBySeat.get(token.seatColor);
					if (!matSurface) continue;
					buildStatusTokenGroup(token, matSurface);
				}

				for (const die of buildSceneDice()) {
				const matSurface = matSurfacesBySeat.get(die.seatColor);
				if (!matSurface) continue;
				buildDieGroup(die, matSurface);
			}

			for (const item of buildSceneItems()) {
				const matSurface = matSurfacesBySeat.get(item.seatColor);
				if (!matSurface) continue;
				buildItemGroup(item, matSurface);
			}
		};

		syncSpiritScene = syncLocalSpiritScene;
		syncLocalSpiritScene();

		const updatePointer = (event: PointerEvent) => {
			if (!renderer) return;
			const rect = renderer.domElement.getBoundingClientRect();
			pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		};

		pointerDownHandler = (event: PointerEvent) => {
			if (!renderer || !camera) return;
			updatePointer(event);
			raycaster.setFromCamera(pointer, camera);
			const intersections = raycaster.intersectObjects(draggableTargets, false);
			const target = intersections[0]?.object?.userData?.spiritRoot as import('three').Group | undefined;
			if (!target) {
				setSelectedSpirit(null);
				return;
			}

			const objectKind = target.userData.objectKind as 'spirit' | 'die' | 'item' | 'potential' | undefined;
			const seatColor = target.userData.seatColor as SeatColor | undefined;
			if (!objectKind || !seatColor) return;

			if (objectKind === 'potential') {
				if (seatColor === projection.viewer.seatColor) {
					onFlipPotentialToken?.(target.userData.slotIndex as number);
				}
				event.preventDefault();
				return;
			}

			if (objectKind === 'spirit') {
				setSelectedSpirit(target);
			} else {
				setSelectedSpirit(null);
			}

			if (!placementEditorEnabled && objectKind !== 'spirit' && seatColor !== projection.viewer.seatColor) {
				return;
			}
			if (!placementEditorEnabled && objectKind === 'spirit' && seatColor !== projection.viewer.seatColor) {
				return;
			}

			const restY = target.position.y;
			dragPlane.constant = -restY;
			if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;

			activeDrag = {
				group: target,
				offset: target.position.clone().sub(dragPoint),
				restY,
				objectType: objectKind,
				seatColor,
				instanceId: target.userData.instanceId as string | undefined
			};
			target.position.y = restY + HEX_SPIRIT_DRAG_LIFT;
			if (controls) controls.enabled = false;
			renderer.domElement.style.cursor = 'grabbing';
			event.preventDefault();
		};

		pointerMoveHandler = (event: PointerEvent) => {
			if (!renderer || !camera) return;
			updatePointer(event);
			raycaster.setFromCamera(pointer, camera);

			if (activeDrag) {
				if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
					activeDrag.group.position.x = dragPoint.x + activeDrag.offset.x;
					activeDrag.group.position.z = dragPoint.z + activeDrag.offset.z;
				}
				return;
			}

			const hovering = raycaster.intersectObjects(draggableTargets, false).length > 0;
			renderer.domElement.style.cursor = hovering ? 'grab' : 'default';
		};

		pointerUpHandler = () => {
			if (activeDrag) {
				activeDrag.group.position.y = activeDrag.restY;
				if (
					onMoveMatObject &&
					activeDrag.objectType !== 'spirit' &&
					activeDrag.instanceId &&
					activeDrag.seatColor === projection.viewer.seatColor
				) {
					const matSurface = matSurfacesBySeat.get(activeDrag.seatColor);
					if (matSurface) {
						matSurface.updateMatrixWorld(true);
						const local = matSurface.worldToLocal(activeDrag.group.position.clone());
						const nextTtsLocal = mapMatToTtsLocal(local.x, local.y);
						onMoveMatObject({
							objectType: activeDrag.objectType,
							instanceId: activeDrag.instanceId,
							localX: nextTtsLocal.x,
							localZ: nextTtsLocal.z
						});
					}
				}
				if (placementEditorEnabled && activeDrag.objectType === 'spirit') {
					const matSurface = matSurfacesBySeat.get(activeDrag.seatColor);
					const slotIndex = activeDrag.group.userData.slotIndex as number | undefined;
					if (matSurface && slotIndex) {
						matSurface.updateMatrixWorld(true);
						const local = matSurface.worldToLocal(activeDrag.group.position.clone());
						const nextTtsLocal = mapMatToTtsLocal(local.x, local.y);
						onSpiritSlotMoved?.({
							slotIndex,
							localX: Number(nextTtsLocal.x.toFixed(3)),
							localZ: Number(nextTtsLocal.z.toFixed(3))
						});
					}
				}
				activeDrag = null;
			}
			if (controls) controls.enabled = true;
			if (renderer) {
				renderer.domElement.style.cursor = 'default';
			}
		};

		keyDownHandler = (event: KeyboardEvent) => {
			const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
			if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(targetTag)) return;

			if (event.code === 'KeyF') {
				const seatColor = selectedSpirit?.userData?.seatColor as SeatColor | undefined;
				const slotIndex = selectedSpirit?.userData?.slotIndex as number | undefined;
				if (seatColor && slotIndex && seatColor === projection.viewer.seatColor) {
					selectedSpirit!.rotation.x = selectedSpirit!.rotation.x === 0 ? Math.PI : 0;
					onFlipSpirit?.(slotIndex);
					event.preventDefault();
				}
				return;
			}

			if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) return;
			activeKeys.add(event.code);
			event.preventDefault();
		};

		keyUpHandler = (event: KeyboardEvent) => {
			activeKeys.delete(event.code);
		};

		blurHandler = () => {
			activeKeys.clear();
		};

		window.addEventListener('keydown', keyDownHandler);
		window.addEventListener('keyup', keyUpHandler);
		window.addEventListener('blur', blurHandler);
		renderer.domElement.addEventListener('pointerdown', pointerDownHandler);
		renderer.domElement.addEventListener('pointermove', pointerMoveHandler);
		window.addEventListener('pointerup', pointerUpHandler);

		const animate = () => {
			if (!renderer || !scene || !camera) return;
			const delta = movementClock.getDelta();

			if (controls && activeKeys.size > 0) {
				camera.getWorldDirection(forward);
				forward.y = 0;
				if (forward.lengthSq() > 0) {
					forward.normalize();
				}

				right.crossVectors(forward, upAxis).normalize();
				movement.set(0, 0, 0);

				if (activeKeys.has('KeyW')) movement.add(forward);
				if (activeKeys.has('KeyS')) movement.sub(forward);
				if (activeKeys.has('KeyD')) movement.add(right);
				if (activeKeys.has('KeyA')) movement.sub(right);

				if (movement.lengthSq() > 0) {
					movement
						.normalize()
						.multiplyScalar(
							(activeKeys.has('ShiftLeft') || activeKeys.has('ShiftRight') ? SPRINT_SPEED : MOVE_SPEED) *
								delta
						);
					camera.position.add(movement);
					controls.target.add(movement);
				}
			}

			controls?.update();
			renderer.render(scene, camera);
			animationFrame = requestAnimationFrame(animate);
		};

		animate();

		resizeHandler = () => {
			if (!renderer || !camera || !host) return;
			camera.aspect = host.clientWidth / host.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(host.clientWidth, host.clientHeight);
		};

		window.addEventListener('resize', resizeHandler);
	}

	onMount(() => {
		void loadAssets();
		void buildScene();
	});

	$effect(() => {
		void sceneBuildKey;
		if (!browser || !host) return;
		teardownScene();
		void buildScene();
	});

		$effect(() => {
			void spiritStateKey;
			if (!browser || !renderer || !syncSpiritScene) return;
			syncSpiritScene();
		});

		$effect(() => {
			void spiritPlacementKey;
			if (!browser || !renderer || !syncSpiritScene) return;
			syncSpiritScene();
		});

		$effect(() => {
			void lightingKey;
			if (!browser || !renderer || !syncTableLighting) return;
			syncTableLighting();
		});

		onDestroy(() => {
		teardownScene();
	});
</script>

<section class:immersive class="scene-shell">
	{#if !immersive}
		<div class="scene-header">
			<div>
				<div class="eyebrow">3D Table View</div>
				<h2>Tabletop Layout</h2>
			</div>
			<div class="scene-note">Board short side = player mat long side</div>
		</div>
	{/if}
	<div bind:this={host} class="scene-host"></div>
</section>

<style>
	/* ── Scene wrapper: clean dark surface, no decorative chrome ── */
	.scene-shell {
		padding: 16px;
		border-radius: 2px;
		border: 1px solid var(--brand-violet);
		background: var(--color-obsidian);
	}

	.scene-shell.immersive {
		padding: 0;
		border-radius: 0;
		border: none;
		background: none;
		height: 100%;
	}

	.scene-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 14px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--color-mist);
	}

	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--brand-cyan);
	}

	/* Scene note: plain muted label */
	.scene-note {
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	/* Scene heading: big Bebas Neue */
	.scene-header h2 {
		margin: 6px 0 0;
		font-family: var(--font-display);
		font-size: 2rem;
		letter-spacing: 0.04em;
		color: #fff;
	}

	/* Canvas host: solid dark background, no rounded decorative frame */
	.scene-host {
		width: 100%;
		aspect-ratio: 16 / 9;
		border-radius: 2px;
		overflow: hidden;
		background: var(--color-void);
	}

	.scene-shell.immersive .scene-host {
		height: 100%;
		aspect-ratio: auto;
		border-radius: 0;
	}

	.scene-host :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	@media (max-width: 820px) {
		.scene-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
