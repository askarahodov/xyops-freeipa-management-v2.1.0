#!/usr/bin/env bash
set -Eeuo pipefail

OWNER="${1:-}"
if [[ -z "$OWNER" ]]; then
  echo "Usage: $0 <github-owner-or-organization>" >&2
  exit 1
fi

if [[ ! "$OWNER" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "Invalid GitHub owner: $OWNER" >&2
  exit 1
fi

sed -i "s#YOUR_GITHUB#${OWNER}#g" xyops.json README.md

echo "Configured repository for GitHub owner: ${OWNER}"
echo "Launch command: npx -y github:${OWNER}/xyOps-FreeIPA-Management#v2.1.0"
