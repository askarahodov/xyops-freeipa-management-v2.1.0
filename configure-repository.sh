#!/usr/bin/env bash
set -Eeuo pipefail

OWNER="${1:-askarahodov}"
REPOSITORY="${2:-xyops-freeipa-management-v2.1.0}"
REF="${3:-main}"

for value in "$OWNER" "$REPOSITORY" "$REF"; do
  if [[ ! "$value" =~ ^[A-Za-z0-9._/-]+$ ]]; then
    echo "Invalid repository component: $value" >&2
    exit 1
  fi
done

COMMAND="npx -y github:${OWNER}/${REPOSITORY}#${REF}"

node - "$COMMAND" <<'NODE'
'use strict';

const fs = require('node:fs');

const command = process.argv[2];
const path = 'xyops.json';
const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
let updated = 0;

for (const item of payload.items || []) {
  if (item.type !== 'plugin' || !item.data) continue;
  if (!String(item.data.id || '').startsWith('pmlc2ha8fipa')) continue;
  item.data.command = command;
  updated += 1;
}

if (!updated) {
  throw new Error('FreeIPA plugin items were not found in xyops.json');
}

fs.writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Updated ${updated} FreeIPA plugin command(s).`);
NODE

echo "Configured xyops.json command: ${COMMAND}"
