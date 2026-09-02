#!/bin/bash
set -euo pipefail

# Sets up a git worktree for local development.
# Handles Turbopack's node_modules symlink rejection and .env copying.
#
# Usage: ./scripts/setup-worktree.sh [worktree-path]
#   If no path given, uses current directory (must be inside a worktree).

WORKTREE="${1:-.}"
MAIN_REPO_ROOT="$(git -C "$WORKTREE" rev-parse --show-toplevel 2>/dev/null)"

if [[ "$MAIN_REPO_ROOT" == *".worktrees"* ]]; then
  MAIN_REPO="$(dirname "$(dirname "$MAIN_REPO_ROOT")")"
else
  MAIN_REPO="$MAIN_REPO_ROOT"
fi

echo "Worktree:  $WORKTREE"
echo "Main repo: $MAIN_REPO"

if [ ! -f "$WORKTREE/.env" ] && [ -f "$MAIN_REPO/.env" ]; then
  cp "$MAIN_REPO/.env" "$WORKTREE/.env"
  echo "✓ Copied .env from main repo"
elif [ -f "$WORKTREE/.env" ]; then
  echo "✓ .env already exists"
else
  echo "⚠ No .env found in main repo — you'll need to create one"
fi

echo "Installing dependencies..."
(cd "$WORKTREE" && bun install --frozen-lockfile 2>/dev/null || cd "$WORKTREE" && bun install)
echo "✓ Dependencies installed"

echo ""
echo "Worktree ready at $WORKTREE"
