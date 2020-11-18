#!/bin/bash

taskId=$1
if [[ -z "$taskId" ]]; then
    >&2 echo "No task id specified."
    exit 1
fi

cat <<EOF
{
  "status": "SUCCESS",
  "taskId": "$taskId",
  "link": "index.json",
  "message": "",
  "a_data": {
    "chtDesc": "證據包下載",
    "type": "link",
    "value": "result.7z",
    "desc": "Analyse Result Download"
  },
  "a_data2": {
    "type": "link",
    "value": "index.json",
    "desc": "JSON Result Download",
    "chtDesc": "JSON報表下載"
  }
}
EOF
