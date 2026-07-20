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
const pluginItem = payload.items.find((item) => (
  item.type === 'plugin' && item.data && item.data.id === 'pmlc2ha8fipa1'
));

if (!pluginItem) {
  throw new Error('FreeIPA plugin item pmlc2ha8fipa1 was not found in xyops.json');
}

pluginItem.data.command = command;
fs.writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
NODE

echo "Configured xyops.json command: ${COMMAND}"
