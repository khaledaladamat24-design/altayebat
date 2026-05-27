#!/usr/bin/env bash
# Quick git push helper — usage:  ./push.sh   or   ./push.sh "your message"
set -e
MSG="${1:-update}"
git add -A
if git diff --cached --quiet; then
  echo "✓ No changes to commit"
else
  git commit -m "$MSG"
fi
git push 2>&1 | tail -5
echo "✅ Done"
