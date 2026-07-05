#!/usr/bin/env bash
# Delegate a task to Cursor CLI (Composer 2.5 by default) so the orchestrating
# Claude Code session spends tokens only on the prompt and a short report.
#
# Usage:
#   tools/delegate.sh [-m model] [-r] "task prompt"
#     -m model   worker model (default: composer-2.5, or $DELEGATE_MODEL)
#     -r         readonly analysis (--mode plan, no edits; may skip the report)
#
# Full transcript  -> .delegate/logs/<ts>.log   (for debugging, not for context)
# Worker's report  -> .delegate/reports/<ts>.md (the only thing to read back)
set -euo pipefail

MODEL="${DELEGATE_MODEL:-composer-2.5}"
EXTRA_ARGS=()
while getopts "m:r" opt; do
  case "$opt" in
    m) MODEL="$OPTARG" ;;
    r) EXTRA_ARGS+=(--mode plan) ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))

[[ $# -ge 1 ]] || { echo "uso: tools/delegate.sh [-m model] [-r] \"tarea\"" >&2; exit 2; }
TASK="$1"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$ROOT/.delegate/logs/$TS.log"
REPORT="$ROOT/.delegate/reports/$TS.md"
mkdir -p "$ROOT/.delegate/logs" "$ROOT/.delegate/reports"

PROMPT="$TASK

Contexto del proyecto: lee AGENTS.md y docs/PRD.md antes de tocar código.

Al terminar, escribe un reporte en $REPORT (máximo 30 líneas, markdown) con:
- Archivos creados/modificados (lista de rutas)
- Decisiones que tomaste y por qué
- Cómo verificar que funciona (comando exacto)
- Problemas o pendientes
No pegues código en el reporte."

echo "delegate → $MODEL (log: .delegate/logs/$TS.log)" >&2
if ! agent -p --trust --force --workspace "$ROOT" --model "$MODEL" \
     ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} "$PROMPT" >"$LOG" 2>&1; then
  echo "delegate: el worker falló; últimas líneas del log:" >&2
  tail -n 15 "$LOG" >&2
  exit 1
fi

if [[ -f "$REPORT" ]]; then
  cat "$REPORT"
  echo
  echo "(reporte: .delegate/reports/$TS.md · log: .delegate/logs/$TS.log)"
else
  echo "delegate: el worker no escribió reporte; últimas líneas del log:"
  tail -n 25 "$LOG"
fi
