#!/bin/sh
# File: /deployment/bootstrap-debian.sh | Version: 0.1.0
set -eu

test "$(id -u)" = 0
. /etc/os-release
test "$ID" = debian
test "$VERSION_ID" = 12
test "$(dpkg --print-architecture)" = amd64
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg xz-utils tar util-linux
install -d -m 0755 /etc/apt/keyrings
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://download.docker.com/linux/debian/gpg -o "$temporary/docker.asc"
fingerprint=$(gpg --batch --show-keys --with-colons "$temporary/docker.asc" | awk -F: '$1 == "fpr" {print $10; exit}')
test "$fingerprint" = 9DC858229FC7DD38854AE2D88D81803C0EBFCD88
install -m 0644 "$temporary/docker.asc" /etc/apt/keyrings/docker.asc
printf '%s\n' 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable' > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$temporary/SHASUMS256.txt"
archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ { print $2 }' "$temporary/SHASUMS256.txt")
test -n "$archive"
test "$(printf '%s\n' "$archive" | wc -l)" -eq 1
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/latest-v24.x/$archive" -o "$temporary/$archive"
awk -v archive="$archive" '$2 == archive' "$temporary/SHASUMS256.txt" > "$temporary/checksum.txt"
(cd "$temporary" && sha256sum --check checksum.txt)
tar -xJf "$temporary/$archive" --strip-components=1 -C /usr/local

install -d -m 0755 /opt/device-update-hub-agent /etc/device-update-hub /var/lib/device-update-hub-exchange
install -d -m 0700 /var/lib/device-update-hub-updater
install -d -o 1000 -g 1000 -m 0700 /var/lib/device-update-hub-exchange/inbox
install -d -o 0 -g 0 -m 0755 /var/lib/device-update-hub-exchange/status
docker version --format '{{.Server.Version}}'
docker compose version
/usr/local/bin/node --version
/usr/local/bin/npm --version
printf '\nBootstrap complete. Application and updater service are not started by this script.\n'