"""
Training script for the Arc Spirits candidate-scoring policy + value network.

Usage:
  ml/.venv/bin/python ml/train.py \
      --data ml/data \
      --out ml/weights/policy.json \
      --epochs 8 \
      --beta 1.0

Losses:
  - Policy: cross-entropy of chosen action under masked softmax,
            weighted by AWR weight w = clamp(exp(beta*(ret - baseline)), 0, 20)
  - Value:  MSE(value(obs), ret)
  - Total:  policy_loss + 0.5 * value_loss
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

# Add ml/ parent to path so we can import model regardless of cwd
sys.path.insert(0, str(Path(__file__).parent))
from model import CandidateScorer, build_model, get_device, load_dims_from_meta


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class DecisionDataset(Dataset):
    """
    Stores all decisions from JSONL files as numpy arrays.
    Padding is done at collation time (per-batch).
    """

    def __init__(self, data_dir: Path) -> None:
        self.obs_list: list[np.ndarray] = []
        self.cands_list: list[np.ndarray] = []  # variable-length lists of cand vecs
        self.chosen_list: list[int] = []
        self.ret_list: list[float] = []

        jsonl_files = sorted(data_dir.glob("*.jsonl"))
        if not jsonl_files:
            raise FileNotFoundError(f"No *.jsonl files found in {data_dir}")

        for fpath in jsonl_files:
            with open(fpath) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    rec: dict[str, Any] = json.loads(line)
                    self.obs_list.append(np.array(rec["obs"], dtype=np.float32))
                    self.cands_list.append(
                        np.array(rec["cands"], dtype=np.float32)
                    )  # shape: (n_cands, act_dim)
                    self.chosen_list.append(int(rec["chosen"]))
                    self.ret_list.append(float(rec["ret"]))

        if not self.obs_list:
            raise ValueError(f"No samples loaded from {data_dir}")

        print(f"Loaded {len(self.obs_list)} samples from {len(jsonl_files)} file(s)")

    def __len__(self) -> int:
        return len(self.obs_list)

    def __getitem__(self, idx: int) -> tuple[np.ndarray, np.ndarray, int, float]:
        return (
            self.obs_list[idx],
            self.cands_list[idx],
            self.chosen_list[idx],
            self.ret_list[idx],
        )


def collate_fn(
    batch: list[tuple[np.ndarray, np.ndarray, int, float]],
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    Pad cands to the maximum number of candidates in the batch.
    Returns: obs, cands_padded, mask, chosen, rets
    """
    obs_list, cands_list, chosen_list, ret_list = zip(*batch)

    obs = torch.from_numpy(np.stack(obs_list))  # (B, obs_dim)
    max_cands = max(c.shape[0] for c in cands_list)
    act_dim = cands_list[0].shape[1]

    B = len(cands_list)
    cands_padded = np.zeros((B, max_cands, act_dim), dtype=np.float32)
    mask = np.zeros((B, max_cands), dtype=bool)

    for i, c in enumerate(cands_list):
        n = c.shape[0]
        cands_padded[i, :n] = c
        mask[i, :n] = True

    cands_t = torch.from_numpy(cands_padded)          # (B, max_cands, act_dim)
    mask_t = torch.from_numpy(mask)                   # (B, max_cands)
    chosen_t = torch.tensor(chosen_list, dtype=torch.long)  # (B,)
    rets_t = torch.tensor(ret_list, dtype=torch.float32)    # (B,)

    return obs, cands_t, mask_t, chosen_t, rets_t


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def compute_baseline(dataset: DecisionDataset) -> float:
    """Running mean of ret over the entire dataset."""
    return float(np.mean(dataset.ret_list))


def train(
    data_dir: Path,
    out_path: Path,
    epochs: int = 8,
    beta: float = 1.0,
    batch_size: int = 256,
    lr: float = 1e-3,
) -> None:
    device = get_device()
    print(f"Device: {device}")

    # Load data
    dataset = DecisionDataset(data_dir)
    baseline = compute_baseline(dataset)
    print(f"Baseline return (mean ret): {baseline:.4f}")

    obs_dim, act_dim = load_dims_from_meta(data_dir)
    print(f"obs_dim={obs_dim}, act_dim={act_dim}")

    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=collate_fn,
        drop_last=False,
    )

    model = build_model(obs_dim, act_dim, device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    for epoch in range(1, epochs + 1):
        model.train()
        total_policy_loss = 0.0
        total_value_loss = 0.0
        total_samples = 0
        correct = 0

        for obs, cands, mask, chosen, rets in loader:
            obs = obs.to(device)
            cands = cands.to(device)
            mask = mask.to(device)
            chosen = chosen.to(device)
            rets = rets.to(device)

            logits, probs, value = model(obs, cands, mask)

            # --- AWR weights ---
            with torch.no_grad():
                awr_w = torch.exp(beta * (rets - baseline)).clamp(0.0, 20.0)

            # --- Policy loss: weighted cross-entropy ---
            # logits: (B, max_cands), already masked
            log_probs = F.log_softmax(logits, dim=-1)  # (B, max_cands)
            chosen_log_prob = log_probs.gather(1, chosen.unsqueeze(1)).squeeze(1)  # (B,)

            # For single-candidate rows the policy loss is ~0 (certainty), so weight doesn't matter
            policy_loss = -(awr_w * chosen_log_prob).mean()

            # --- Value loss: MSE ---
            value_loss = F.mse_loss(value, rets)

            # --- Total ---
            loss = policy_loss + 0.5 * value_loss

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            # Accuracy: argmax of logits (among valid candidates)
            # Zero out invalid candidates by setting logits to -inf before argmax
            pred = logits.argmax(dim=-1)  # (B,)
            correct += (pred == chosen).sum().item()
            total_samples += len(chosen)

            total_policy_loss += policy_loss.item() * len(chosen)
            total_value_loss += value_loss.item() * len(chosen)

        avg_policy = total_policy_loss / total_samples
        avg_value = total_value_loss / total_samples
        accuracy = correct / total_samples

        print(
            f"Epoch {epoch}/{epochs} | "
            f"policy_loss={avg_policy:.4f} | "
            f"value_loss={avg_value:.4f} | "
            f"top1_acc={accuracy:.3f}"
        )

    # Export weights
    export_weights(model, obs_dim, act_dim, out_path)
    print(f"\nWeights exported to: {out_path}")


# ---------------------------------------------------------------------------
# Weight export
# ---------------------------------------------------------------------------

def _linear_to_dict(layer: torch.nn.Linear) -> dict:
    """Serialize a Linear layer to W (out x in list-of-lists) and b (list)."""
    W = layer.weight.detach().cpu().float().tolist()  # out_features x in_features
    b = layer.bias.detach().cpu().float().tolist()    # out_features
    return {"W": W, "b": b}


def export_weights(
    model: CandidateScorer,
    obs_dim: int,
    act_dim: int,
    out_path: Path,
) -> None:
    """Export model weights to the TS-consumable JSON format."""
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Trunk: Sequential with Linear(trunk_in,128), ReLU, Linear(128,128), ReLU, Linear(128,1)
    # Extract only the Linear layers (indices 0, 2, 4)
    trunk_linears = [
        _linear_to_dict(layer)
        for layer in model.trunk
        if isinstance(layer, torch.nn.Linear)
    ]

    # Value head: Sequential with Linear(obs_dim,64), ReLU, Linear(64,1)
    value_linears = [
        _linear_to_dict(layer)
        for layer in model.value_head
        if isinstance(layer, torch.nn.Linear)
    ]

    payload = {
        "format": "arc-cand-scorer-v1",
        "obs_dim": obs_dim,
        "act_dim": act_dim,
        "trunk": trunk_linears,
        "trunk_hidden": [128, 128],
        "value": value_linears,
    }

    with open(out_path, "w") as f:
        json.dump(payload, f)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train Arc Spirits candidate scorer")
    p.add_argument("--data", type=Path, default=Path("ml/data"), help="Directory with *.jsonl files")
    p.add_argument("--out", type=Path, default=Path("ml/weights/policy.json"), help="Output JSON path")
    p.add_argument("--epochs", type=int, default=8)
    p.add_argument("--beta", type=float, default=1.0, help="AWR temperature (0=behavior cloning)")
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train(
        data_dir=args.data,
        out_path=args.out,
        epochs=args.epochs,
        beta=args.beta,
        batch_size=args.batch_size,
        lr=args.lr,
    )
