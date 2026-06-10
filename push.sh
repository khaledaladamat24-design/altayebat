#!/usr/bin/env bash
# Quick git sync helper — usage:  ./push.sh "your message"
# Pulls remote changes first (rebase), then commits + pushes local changes.
set -e
MSG="${1:-update}"

echo "📥 Pulling latest from GitHub..."
git pull --rebase origin main || {
  echo "❌ Pull failed — resolve conflicts manually, then re-run."
  exit 1
}

git add -A
if git diff --cached --quiet; then
  echo "✓ No local changes to commit"
else
  git commit -m "$MSG"
fi

echo "📤 Pushing to GitHub..."
git push 2>&1 | tail -5
echo "✅ Done"
