#!/usr/bin/env bash
# Builds the site for GitHub Pages and force-pushes it to the gh-pages branch.
# Usage: npm run deploy
set -euo pipefail

cd "$(dirname "$0")/.."
REMOTE_URL="$(git remote get-url origin)"
REPO_NAME="$(basename -s .git "$REMOTE_URL")"

npx tsc -b
npx vite build --base="/${REPO_NAME}/"
touch dist/.nojekyll          # serve files as-is (no Jekyll processing)
cp dist/index.html dist/404.html

cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" \
  commit -q -m "Deploy $(git -C .. rev-parse --short HEAD)"
git push -q -f "$REMOTE_URL" gh-pages
rm -rf .git
echo "Deployed to gh-pages for ${REPO_NAME}"
