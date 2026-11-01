#!/usr/bin/env bash
# claude.ai 링크(아티팩트)용 빌드: vendor 파일 대신 공식 CDN에서 라이브러리를 불러오도록 경로만 바꾼다.
set -euo pipefail
cd "$(dirname "$0")/.."
THREE_CDN='https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js'
CANNON_CDN='https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js'
fix() { sed -e "s#'\.\./vendor/three\.module\.min\.js'#'${THREE_CDN}'#" -e "s#'\.\./vendor/cannon-es\.js'#'${CANNON_CDN}'#" "$1" > "$2"; }

# 길냥이체험기
rm -rf dist/artifact && mkdir -p dist/artifact/src
cp index.html dist/artifact/
for f in src/*.js; do fix "$f" "dist/artifact/$f"; done

# 재미 실험실
rm -rf dist/lab && mkdir -p dist/lab/lab dist/lab/src
sed 's#src="\./lab\.js"#src="./lab/lab.js"#' lab/index.html > dist/lab/index.html
for f in lab/*.js; do fix "$f" "dist/lab/$f"; done
for f in src/input.js src/audio.js src/util.js; do fix "$f" "dist/lab/$f"; done
grep -rl "vendor/" dist && { echo "vendor 경로가 남아 있음"; exit 1; } || echo "빌드 완료: dist/artifact, dist/lab"
