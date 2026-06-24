"""
Candidate-scoring policy + value network for Arc Spirits bot training.

Architecture:
  - Trunk (candidate scorer): concat(obs, cand_feat) -> 128 -> 128 -> 1 (logit per candidate)
  - Value head: obs -> 64 -> 1 (state value estimate)

Policy: softmax over per-candidate logits (with padding mask).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


def get_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class CandidateScorer(nn.Module):
    """
    Scores each candidate action given the obs context.

    Input: obs (batch, obs_dim), cands (batch, max_cands, act_dim), mask (batch, max_cands)
    Output:
      - logits (batch, max_cands): raw scores before softmax
      - probs (batch, max_cands): softmax probabilities (masked)
      - value (batch,): state value estimate from value head
    """

    def __init__(self, obs_dim: int, act_dim: int) -> None:
        super().__init__()
        self.obs_dim = obs_dim
        self.act_dim = act_dim

        trunk_in = obs_dim + act_dim
        self.trunk = nn.Sequential(
            nn.Linear(trunk_in, 128),
            nn.ReLU(),
            nn.Linear(128, 128),
            nn.ReLU(),
            nn.Linear(128, 1),
        )

        self.value_head = nn.Sequential(
            nn.Linear(obs_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
        )

    def forward(
        self,
        obs: torch.Tensor,           # (batch, obs_dim)
        cands: torch.Tensor,          # (batch, max_cands, act_dim)
        mask: torch.Tensor,           # (batch, max_cands) — True = valid, False = padded
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        batch, max_cands, _ = cands.shape

        # Expand obs to match each candidate: (batch, max_cands, obs_dim)
        obs_exp = obs.unsqueeze(1).expand(-1, max_cands, -1)

        # Concatenate obs + cand features: (batch, max_cands, obs_dim+act_dim)
        trunk_in = torch.cat([obs_exp, cands], dim=-1)

        # Score each candidate: (batch, max_cands)
        logits = self.trunk(trunk_in).squeeze(-1)

        # Apply padding mask: set padded positions to large negative before softmax
        logits_masked = logits.masked_fill(~mask, -1e9)

        probs = F.softmax(logits_masked, dim=-1)

        # Value estimate from obs only: (batch,)
        value = self.value_head(obs).squeeze(-1)

        return logits_masked, probs, value

    def score_single(
        self, obs: torch.Tensor, cands: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Convenience wrapper for inference with variable-length cands (no padding needed).
        obs: (obs_dim,) or (1, obs_dim)
        cands: (n_cands, act_dim) or (1, n_cands, act_dim)
        """
        if obs.dim() == 1:
            obs = obs.unsqueeze(0)
        if cands.dim() == 2:
            cands = cands.unsqueeze(0)
        mask = torch.ones(cands.shape[0], cands.shape[1], dtype=torch.bool, device=cands.device)
        return self.forward(obs, cands, mask)


def build_model(obs_dim: int, act_dim: int, device: Optional[torch.device] = None) -> CandidateScorer:
    """Build and return a CandidateScorer on the target device."""
    if device is None:
        device = get_device()
    model = CandidateScorer(obs_dim, act_dim).float().to(device)
    return model


def load_dims_from_meta(data_dir: str | Path) -> tuple[int, int]:
    """Read obs_dim and act_dim from meta.json, falling back to first data line."""
    data_dir = Path(data_dir)
    meta_path = data_dir / "meta.json"
    if meta_path.exists():
        with open(meta_path) as f:
            meta = json.load(f)
        return int(meta["obs_dim"]), int(meta["act_dim"])

    # Fallback: infer from first JSONL line
    jsonl_files = sorted(data_dir.glob("*.jsonl"))
    if not jsonl_files:
        raise FileNotFoundError(f"No meta.json or *.jsonl in {data_dir}")
    with open(jsonl_files[0]) as f:
        first = json.loads(f.readline())
    obs_dim = len(first["obs"])
    act_dim = len(first["cands"][0])
    return obs_dim, act_dim
