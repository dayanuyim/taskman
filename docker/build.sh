#!/bin/bash

VER="${1#[vV]}"
IMG="dayanuyimable/taskman:$VER"

if [[ -z "$VER" ]]; then
    >&2 echo "usage: ${0##*/} <version, eg. 1.0.0>"
    exit 1
fi

docker build \
    --build-arg "GIT_HASH=$(git log --format="%h" -n1)" \
    --build-arg "APP_HOME=/root/taskman" \
    -t "$IMG" .

read -r -p "==> push image $IMG? [Y/n] " ans
if ! [[ $ans == [Nn]* ]]; then
    docker push "$IMG"
fi
