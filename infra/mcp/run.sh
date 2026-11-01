#!/bin/bash
# Lambda Web Adapter entrypoint: start the ASGI app with uvicorn.
export PYTHONPATH="$LAMBDA_TASK_ROOT:$LAMBDA_TASK_ROOT/deps:$LAMBDA_TASK_ROOT/plugin/scripts:$LAMBDA_TASK_ROOT/plugin/skills/flight-crawl-orchestrator/scripts:$PYTHONPATH"
exec python -m uvicorn latam_trip_mcp.server:app --host 0.0.0.0 --port "${PORT:-8080}"
