/**
 * Pure-TypeScript forward pass for the candidate-scoring policy/value net.
 *
 * Training and all gradients live in Python (PyTorch/MPS); it exports weights as JSON
 * (see ml/train.py → ml/weights/policy.json). This file ONLY does inference, so the
 * data-generation self-play and the arena evaluation can run at native Node speed with
 * zero native dependencies. The math here must mirror the Python forward EXACTLY:
 *   trunk(concat(obs, cand)) → scalar logit per candidate;  softmax = policy.
 *   value(obs) → scalar baseline.
 * Each Linear is stored as W (out×in, row-major) + b (out); ReLU between layers, none last.
 */

export interface LinearLayer {
	W: number[][]; // out x in
	b: number[]; // out
}

export interface PolicyWeights {
	format: string;
	obs_dim: number;
	act_dim: number;
	trunk: LinearLayer[];
	value: LinearLayer[];
}

function linear(x: number[], layer: LinearLayer): number[] {
	const { W, b } = layer;
	const out = new Array<number>(W.length);
	for (let o = 0; o < W.length; o++) {
		const row = W[o];
		let acc = b[o];
		for (let i = 0; i < row.length; i++) acc += row[i] * x[i];
		out[o] = acc;
	}
	return out;
}

function relu(x: number[]): number[] {
	for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0;
	return x;
}

/** Run an MLP (ReLU between layers, none after the last). */
function mlp(x: number[], layers: LinearLayer[]): number[] {
	let h = x;
	for (let l = 0; l < layers.length; l++) {
		h = linear(h, layers[l]);
		if (l < layers.length - 1) h = relu(h);
	}
	return h;
}

export class NeuralPolicy {
	readonly w: PolicyWeights;
	constructor(weights: PolicyWeights) {
		this.w = weights;
	}

	/** Logit for one candidate = trunk(concat(obs, cand))[0]. */
	private logit(obs: number[], cand: number[]): number {
		const x = obs.concat(cand);
		return mlp(x, this.w.trunk)[0];
	}

	/** Raw logits for every candidate (same order as `cands`). */
	scoreCandidates(obs: number[], cands: number[][]): number[] {
		return cands.map((c) => this.logit(obs, c));
	}

	/** State value baseline in ~[0,1]. */
	value(obs: number[]): number {
		return mlp(obs, this.w.value)[0];
	}

	/** Softmax probabilities over candidates (numerically stable). */
	probs(obs: number[], cands: number[][], temperature = 1): number[] {
		const logits = this.scoreCandidates(obs, cands);
		const t = Math.max(1e-6, temperature);
		let max = -Infinity;
		for (const l of logits) if (l > max) max = l;
		const exps = logits.map((l) => Math.exp((l - max) / t));
		const sum = exps.reduce((a, b) => a + b, 0) || 1;
		return exps.map((e) => e / sum);
	}

	/**
	 * Choose a candidate index. Greedy (argmax) by default; set `sample` to draw from the
	 * softmax (exploration during data generation). `rand` is a [0,1) source so callers can
	 * thread the seeded engine RNG for reproducibility.
	 */
	pick(
		obs: number[],
		cands: number[][],
		opts?: { sample?: boolean; temperature?: number; rand?: () => number }
	): number {
		if (cands.length <= 1) return 0;
		if (!opts?.sample) {
			const logits = this.scoreCandidates(obs, cands);
			let best = 0;
			for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
			return best;
		}
		const p = this.probs(obs, cands, opts.temperature ?? 1);
		const r = (opts.rand ?? Math.random)();
		let acc = 0;
		for (let i = 0; i < p.length; i++) {
			acc += p[i];
			if (r <= acc) return i;
		}
		return p.length - 1;
	}
}

/** Parse + lightly validate an exported weights blob. */
export function loadPolicyWeights(json: unknown): NeuralPolicy {
	const w = json as PolicyWeights;
	if (!w || !Array.isArray(w.trunk) || !Array.isArray(w.value)) {
		throw new Error('Invalid policy weights: missing trunk/value layers');
	}
	if (w.trunk[w.trunk.length - 1]?.W.length !== 1) {
		throw new Error('Invalid policy weights: trunk must end in a single logit');
	}
	return new NeuralPolicy(w);
}
