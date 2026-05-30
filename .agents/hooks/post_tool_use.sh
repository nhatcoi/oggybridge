#!/bin/bash
# OggyBridge hook — pipes stdin to the local hook bridge.
curl -s -o /dev/null --max-time 5 \
-X POST "http://127.0.0.1:44019/hooks/claude-code" \
-H "Authorization: Bearer 8c67c6f8-4c84-45d1-a0f7-510450dba95d" \
-H "Content-Type: application/json" \
--data-binary @-
exit 0
