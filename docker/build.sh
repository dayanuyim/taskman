#!/bin/bash

IMG=dayanuyimable/taskman:1.0.0

docker build \
    --build-arg "GIT_HASH=$(git log --format="%h" -n1)" \
    --build-arg "APP_HOME=/root/taskman" \
    -t "$IMG" .

read -r -p "==> push image $IMG? [Y/n] " ans
if ! [[ $ans == [Nn]* ]]; then
    docker push "$IMG"
fi
