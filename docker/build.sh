#!/bin/bash

VER="${1#[vV]}"
IMG="dayanuyimable/taskman:$VER"

DOCK="$(dirname "$(realpath "$0")")"
HOME="$(dirname "$DOCK")"
DIST="$DOCK/files/_app_"

function usage {
    images="$(docker images --format '{{.Repository}}:{{.Tag}}' | grep "$IMG" | sort -r | sed 's/^/\t/')"

    cat >&2 <<-EOT
	usage: ${0##*/} <version, eg. 1.0.0>

	found old image in the system:
	$images
	EOT
}

function hash_folder {
    dir="$1"
    find "$dir" -type f -print0 | sort -z | xargs -0 sha1sum | sha1sum | awk '{print $1}'
}

function build_dist {
    dist="$(realpath "$1")"

    mkdir -p                                                          "${dist:?}"
    rm -rf                                                            "${dist:?No dist folder specified}"/*
    cd "$HOME" || exit 1
    cp package.json package-lock.json nodemon.json server.js utils.js "${dist}"
    cd -
}

if [[ -z "$VER" ]]; then
    usage
    exit 1
fi

build_dist "$DIST" || exit 1
if docker build \
    --build-arg "APP_HASH=$(hash_folder "$DIST")" \
    --build-arg "APP_HOME=/root/taskman" \
    -t "$IMG" .
then
    read -r -p "==> push image $IMG? [Y/n] " ans
    if ! [[ $ans == [Nn]* ]]; then
        docker push "$IMG"
    fi
fi
