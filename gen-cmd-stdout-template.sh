#!/bin/bash

taskId=$1

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
  },
  "a_info": {
    "type": "label",
    "value": "index.json",
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
