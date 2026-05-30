#!/bin/bash
# OggyBridge hook — pipes stdin to the local hook bridge.
curl -s -o /dev/null --max-time 5 \
-X POST "http://127.0.0.1:33049/hooks/claude-code" \
-H "Authorization: Bearer e04b0d4b-54ce-40bf-a543-c0ed8c0b26ff" \
-H "Content-Type: application/json" \
--data-binary @-
exit 0
