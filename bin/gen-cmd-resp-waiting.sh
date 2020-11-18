#!/bin/bash

taskId=$1
if [[ -z "$taskId" ]]; then
    >&2 echo "No task id specified."
    exit 1
fi

cat <<EOF
{
  "status": "WAITING",
  "taskId": "$taskId",
  "message": "",
  "a_info": {
    "type": "label",
    "value": "50%",
    "desc": "progress",
    "chtDesc": "進度"
  },
  "a_msg": {
    "type": "text",
    "value": "This is a test message",
    "desc": "",
    "chtDesc": ""
  }
}
EOF
