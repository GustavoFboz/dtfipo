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
if [ -n "${DENTALFLOW_ANDROID_EXPECTED_CERT_SHA256:-}" ]; then
  actual_cert_sha256="$(keytool -exportcert -keystore "$keystore" -storetype PKCS12 -alias dentalflow -storepass:file "$password" | sha256sum | awk '{print $1}')"
  if [ "$actual_cert_sha256" != "$DENTALFLOW_ANDROID_EXPECTED_CERT_SHA256" ]; then
    echo "Unexpected Android signing certificate: $actual_cert_sha256" >&2
    exit 1
  fi
fi
java -jar "$signer" sign --ks "$keystore" --ks-key-alias dentalflow --ks-pass "file:$password" --key-pass "file:$password" --v4-signing-enabled false --out "$output" "$input"
java -jar "$signer" verify --verbose --print-certs "$output"
sha256sum "$output"
