#!/bin/bash

TASK_HOME=$HOME/Works/task-adapter/tasks
TASK_API=http://localhost/ufo/mq.php

taskId="$1"
taskDir="$TASK_HOME/$taskId"
taskResult="$taskDir/result.json"

if [[ -z "$taskId" ]]; then
    >&2 echo "usage: ${0##*/} <task-id>"
    exit 1
fi

if [[ ! -d "$taskDir" ]]; then
    >&2 echo "task $taskId not exist"
    exit 2
fi

if [[ ! -e "$taskResult" ]]; then
    >&2 echo "task $taskId has no result yet."

    if [[ -z $(docker ps -q -f name="ufo-cmd-$taskId") ]]; then
        >&2 echo "docker container for task $taskId does not exist or die"
    fi

    exit 2
fi

curl -si -H "Content-Type:application/json" "$TASK_API" -d@"$taskResult"
