"""
Round-trip verification for the exported policy.json weights.

Loads the JSON, re-runs a forward pass in pure numpy, and compares
against a PyTorch forward pass. Asserts max abs diff < 1e-4.

Usage:
  ml/.venv/bin/python ml/verify_export.py --weights ml/weights/policy.json --data ml/data
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parent))
from model import build_model, get_device, load_dims_from_meta


# ---------------------------------------------------------------------------
# Numpy forward pass (mirrors the TS implementation exactly)
# ---------------------------------------------------------------------------

def relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(x, 0.0)


def linear_np(x: np.ndarray, W: np.ndarray, b: np.ndarray) -> np.ndarray:
    """y = W @ x + b  (W is out x in)."""
    return W @ x + b


def mlp_forward_np(
    x: np.ndarray,
    layers: list[dict],
    apply_relu_after_last: bool = False,
) -> np.ndarray:
    """
    Run a list of {"W": ..., "b": ...} layers with ReLU between them
    (no activation after the last layer unless apply_relu_after_last=True).
    """
    out = x
    for i, layer in enumerate(layers):
        W = np.array(layer["W"], dtype=np.float32)
        b = np.array(layer["b"], dtype=np.float32)
        out = linear_np(out, W, b)
        is_last = i == len(layers) - 1
        if not is_last or apply_relu_after_last:
            out = relu(out)
    return out


def numpy_forward(
    payload: dict,
    obs: np.ndarray,
    cands: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """
    obs: (obs_dim,)
    cands: (n_cands, act_dim)
    Returns: logits (n_cands,), value scalar
    """
    trunk_layers = payload["trunk"]
    value_layers = payload["value"]

    n_cands = cands.shape[0]
    logits = np.zeros(n_cands, dtype=np.float32)

    for i in range(n_cands):
        trunk_in = np.concatenate([obs, cands[i]])  # (obs_dim + act_dim,)
        logit = mlp_forward_np(trunk_in, trunk_layers)  # shape (1,) from last Linear
        logits[i] = float(logit.squeeze())

    value = float(mlp_forward_np(obs, value_layers).squeeze())
    return logits, value


def softmax_np(x: np.ndarray) -> np.ndarray:
    x = x - np.max(x)
    e = np.exp(x)
    return e / e.sum()


# ---------------------------------------------------------------------------
# PyTorch forward pass (single sample, no batching)
# ---------------------------------------------------------------------------

def torch_forward(
    model: torch.nn.Module,
    obs: np.ndarray,
    cands: np.ndarray,
    device: torch.device,
) -> tuple[np.ndarray, float]:
    model.eval()
    with torch.no_grad():
        obs_t = torch.from_numpy(obs).float().unsqueeze(0).to(device)   # (1, obs_dim)
        cands_t = torch.from_numpy(cands).float().unsqueeze(0).to(device)  # (1, n, act_dim)
        mask_t = torch.ones(1, cands.shape[0], dtype=torch.bool, device=device)

        logits_t, _, value_t = model(obs_t, cands_t, mask_t)

    logits_np = logits_t.squeeze(0).cpu().numpy()  # (n_cands,)
    value_np = float(value_t.squeeze().cpu().numpy())
    return logits_np, value_np


# ---------------------------------------------------------------------------
# Main verification
# ---------------------------------------------------------------------------

def verify(weights_path: Path, data_dir: Path, n_checks: int = 20) -> bool:
    print(f"Loading weights from: {weights_path}")
    with open(weights_path) as f:
        payload = json.load(f)

    assert payload["format"] == "arc-cand-scorer-v1", "Unexpected format field"
    obs_dim: int = payload["obs_dim"]
    act_dim: int = payload["act_dim"]
    print(f"obs_dim={obs_dim}, act_dim={act_dim}")

    # Verify shape consistency
    trunk = payload["trunk"]
    value = payload["value"]
    print(f"Trunk layers: {len(trunk)}, Value layers: {len(value)}")

    # Check trunk layer shapes
    expected_trunk_shapes = [
        (128, obs_dim + act_dim),
        (128, 128),
        (1, 128),
    ]
    for i, (layer, (out_exp, in_exp)) in enumerate(zip(trunk, expected_trunk_shapes)):
        W = layer["W"]
        assert len(W) == out_exp, f"Trunk layer {i} W rows: got {len(W)}, expected {out_exp}"
        assert len(W[0]) == in_exp, f"Trunk layer {i} W cols: got {len(W[0])}, expected {in_exp}"
        assert len(layer["b"]) == out_exp, f"Trunk layer {i} b: got {len(layer['b'])}, expected {out_exp}"
    print("Trunk shape check: OK")

    expected_value_shapes = [(64, obs_dim), (1, 64)]
    for i, (layer, (out_exp, in_exp)) in enumerate(zip(value, expected_value_shapes)):
        W = layer["W"]
        assert len(W) == out_exp, f"Value layer {i} W rows: got {len(W)}, expected {out_exp}"
        assert len(W[0]) == in_exp, f"Value layer {i} W cols: got {len(W[0])}, expected {in_exp}"
    print("Value head shape check: OK")

    # Rebuild torch model and load weights
    device = get_device()
    model = build_model(obs_dim, act_dim, device)

    # Re-populate model weights from JSON
    trunk_linears = [l for l in model.trunk if isinstance(l, torch.nn.Linear)]
    for layer_np, layer_torch in zip(trunk, trunk_linears):
        W = torch.tensor(layer_np["W"], dtype=torch.float32)
        b = torch.tensor(layer_np["b"], dtype=torch.float32)
        layer_torch.weight.data.copy_(W)
        layer_torch.bias.data.copy_(b)

    value_linears = [l for l in model.value_head if isinstance(l, torch.nn.Linear)]
    for layer_np, layer_torch in zip(value, value_linears):
        W = torch.tensor(layer_np["W"], dtype=torch.float32)
        b = torch.tensor(layer_np["b"], dtype=torch.float32)
        layer_torch.weight.data.copy_(W)
        layer_torch.bias.data.copy_(b)

    model = model.to(device)

    # Generate random test inputs
    rng = np.random.default_rng(0)
    max_diff_logit = 0.0
    max_diff_value = 0.0

    for check_i in range(n_checks):
        n_cands = rng.integers(1, 7)
        obs = rng.standard_normal(obs_dim).astype(np.float32)
        cands = rng.standard_normal((n_cands, act_dim)).astype(np.float32)

        logits_np, value_np = numpy_forward(payload, obs, cands)
        logits_torch, value_torch = torch_forward(model, obs, cands, device)

        diff_logit = float(np.max(np.abs(logits_np - logits_torch)))
        diff_value = float(np.abs(value_np - value_torch))
        max_diff_logit = max(max_diff_logit, diff_logit)
        max_diff_value = max(max_diff_value, diff_value)

        if diff_logit > 1e-4 or diff_value > 1e-4:
            print(f"  Check {check_i}: logit_diff={diff_logit:.2e}  value_diff={diff_value:.2e}  MISMATCH")
        else:
            print(f"  Check {check_i}: logit_diff={diff_logit:.2e}  value_diff={diff_value:.2e}  ok")

    passed = max_diff_logit < 1e-4 and max_diff_value < 1e-4
    print(f"\nMax logit diff: {max_diff_logit:.2e}")
    print(f"Max value diff: {max_diff_value:.2e}")
    print(f"Threshold: 1e-4")
    print(f"\n{'PASS' if passed else 'FAIL'}")
    return passed


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Verify exported policy.json round-trip")
    p.add_argument("--weights", type=Path, default=Path("ml/weights/policy.json"))
    p.add_argument("--data", type=Path, default=Path("ml/data"))
    p.add_argument("--checks", type=int, default=20, help="Number of random forward-pass checks")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    ok = verify(args.weights, args.data, n_checks=args.checks)
    sys.exit(0 if ok else 1)
