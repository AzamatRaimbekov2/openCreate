#!/usr/bin/env bash
# PostToolUse(Write|Edit|MultiEdit) — принуждение фронтового стандарта.
# На каждую правку .ts/.tsx-файла в проекте, где есть eslint.config.*, прогоняет ESLint
# ТОЛЬКО по этому файлу и, если есть нарушения, возвращает их в контекст модели.
# Так «не-гнущиеся» правила react-senior-standard.md принуждаются автоматически и ВИДИМО,
# а не только декларируются в скилле. Не блокирует (exit 0) — сообщает, чтобы агент исправил.
# Отключить: export FRONTEND_LINT_HOOK=0
set -uo pipefail
[ "${FRONTEND_LINT_HOOK:-1}" = "0" ] && exit 0

# 1) Достаём путь отредактированного файла из JSON на stdin (tool_input.file_path).
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get("tool_input",{}).get("file_path",""))
except Exception:
    print("")' 2>/dev/null)"

# 2) Только TS/TSX-исходники (не .md, не конфиги-заглушки).
case "$FILE" in
  *.ts|*.tsx) : ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

# 3) Ищем корень проекта вверх по дереву (где лежит eslint.config.*).
DIR="$(cd "$(dirname "$FILE")" && pwd)"
ROOT=""
d="$DIR"
while [ "$d" != "/" ]; do
  if ls "$d"/eslint.config.* >/dev/null 2>&1; then ROOT="$d"; break; fi
  d="$(dirname "$d")"
done
[ -z "$ROOT" ] && exit 0                      # нет ESLint в проекте — нечего принуждать
[ -x "$ROOT/node_modules/.bin/eslint" ] || exit 0  # зависимости не установлены — тихо выходим

# 4) Линтим только этот файл. Компактный формат, без падения хука на ненулевом коде.
OUT="$(cd "$ROOT" && node_modules/.bin/eslint --format stylish "$FILE" 2>/dev/null)"
STATUS=$?
[ $STATUS -eq 0 ] && exit 0                   # чисто — молчим

REL="${FILE#"$ROOT"/}"
cat <<MSG
<frontend-standard-enforcement file="$REL">
ESLint нашёл нарушения фронтового стандарта (react-senior-standard.md) в только что
изменённом файле. Исправь их в этом же файле, прежде чем считать задачу завершённой —
это принуждаемые «не-гнущиеся» правила, а не советы:

$OUT

Если правило здесь неприменимо (редкое легитимное исключение, напр. module augmentation),
подави точечно // eslint-disable-next-line <rule> с комментарием-причиной.
</frontend-standard-enforcement>
MSG
exit 0
