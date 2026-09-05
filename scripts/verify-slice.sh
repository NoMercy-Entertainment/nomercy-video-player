#!/usr/bin/env bash
# -----------------------------------------------------------------------------
#  Copyright (c) NoMercy Entertainment
#
#  Licensed under the Apache License, Version 2.0. See LICENSE for details.
#
#  SPDX-License-Identifier: Apache-2.0
# -----------------------------------------------------------------------------
#
# One command for the checks a slice has to pass before it is committed, in the
# order that fails cheapest first. Run it instead of retyping the sequence, so
# no step gets dropped on the third repetition.
#
#   scripts/verify-slice.sh                        everything
#   scripts/verify-slice.sh src/foo.ts e2e/bar.ts  lint only these files
#
# Lint runs with CI=true because the shared config silently drops rules when it
# thinks it is running inside an editor, which hides real errors.

set -euo pipefail

cd "$(dirname "$0")/.."

FILES=("$@")

echo "== typecheck =="
npm run typecheck

echo "== lint =="
if [ ${#FILES[@]} -gt 0 ]; then
	CI=true npx eslint "${FILES[@]}"
else
	CI=true npm run lint
fi

echo "== unit =="
npx vitest run

echo "== e2e =="
npm run pretest:e2e
npx playwright test

echo "== all green =="
