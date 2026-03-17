#!/usr/bin/env bash
# EAS build hook: runs after npm install, before expo prebuild.
# Creates the .expo/web cache directory so @expo/image-utils can write to it.
set -euo pipefail
mkdir -p .expo/web
