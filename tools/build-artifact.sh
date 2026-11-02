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
# 바람 산책
rm -rf dist/sky && mkdir -p dist/sky/sky dist/sky/src dist/sky/lab
sed 's#src="\./main\.js"#src="./sky/main.js"#' sky/index.html > dist/sky/index.html
for f in sky/*.js; do fix "$f" "dist/sky/$f"; done
for f in src/input.js src/util.js lab/common.js; do fix "$f" "dist/sky/$f"; done
# 아티팩트 페이지는 html/head/body 뼈대를 자동으로 감싸므로 바람 산책 페이지에서는 뺀다
python3 - <<'PY'
import re
p = 'dist/sky/index.html'
s = open(p, encoding='utf-8').read()
for pat in [r'<!DOCTYPE html>\n', r'<html lang="ko">\n', r'<head>\n', r'<meta charset="utf-8">\n', r'<meta name="viewport"[^>]*>\n', r'</head>\n', r'<body>\n', r'</body>\n', r'</html>\n?']:
    s = re.sub(pat, '', s)
s = s.replace('<title>바람 산책</title>', '<title>바람 산책</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1)
open(p, 'w', encoding='utf-8').write(s)
PY
grep -rl "vendor/" dist && { echo "vendor 경로가 남아 있음"; exit 1; } || echo "빌드 완료: dist/artifact, dist/lab, dist/sky"
