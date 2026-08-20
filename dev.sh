#!/bin/bash
set -e
JOBS=""
trap 'kill $JOBS 2>/dev/null; exit' EXIT INT TERM
npx next dev &
JOBS=$!
wait $JOBS
