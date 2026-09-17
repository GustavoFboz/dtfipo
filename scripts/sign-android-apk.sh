#!/bin/sh
set -eu
if [ "$#" -ne 5 ]; then
  echo "Usage: $0 apksigner.jar input.apk output.apk keystore.p12 password-file" >&2
  exit 2
fi
signer="$1"
input="$2"
output="$3"
keystore="$4"
password="$5"
test -s "$signer"
test -s "$input"
test -s "$keystore"
test -s "$password"
test "$input" != "$output"
# Passwords and the private key stay outside source control and process args.
java -jar "$signer" sign --ks "$keystore" --ks-key-alias dentalflow --ks-pass "file:$password" --key-pass "file:$password" --v4-signing-enabled false --out "$output" "$input"
java -jar "$signer" verify --verbose --print-certs "$output"
sha256sum "$output"
