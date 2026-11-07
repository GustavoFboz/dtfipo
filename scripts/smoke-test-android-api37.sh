#!/usr/bin/env bash
# Android API 37: wait for the input service before unlocking; upstream
# emulator-runner@v2 unlocks immediately and can fail with Broken pipe (32)
# before executing DentalFlow's own smoke script.
set -Eeuo pipefail

# Hosted runners may point avdmanager and emulator to different AVD homes.
# A single explicit directory avoids a silent 180s adb timeout on missing AVD.
export ANDROID_AVD_HOME="${RUNNER_TEMP:-/tmp}/dentalflow-api37-avds"
mkdir -p "$ANDROID_AVD_HOME"
sdkmanager --install emulator 'platforms;android-37.0' \
  'system-images;android-37.0;google_apis;x86_64'
printf 'no\n' | avdmanager create avd --force --name dentalflow-api37 \
  --package 'system-images;android-37.0;google_apis;x86_64' --device pixel_6 \
  --path "$ANDROID_AVD_HOME/dentalflow-api37.avd"
test -s "$ANDROID_AVD_HOME/dentalflow-api37.avd/config.ini" || {
  echo "::error::Android37 AVD configuration missing"
  exit 1
}
printf 'avd.ini.encoding=UTF-8\npath=%s\ntarget=android-37.0\n' \
  "$ANDROID_AVD_HOME/dentalflow-api37.avd" > "$ANDROID_AVD_HOME/dentalflow-api37.ini"
"$ANDROID_HOME/emulator/emulator" -list-avds | grep -Fxq dentalflow-api37 || {
  echo "::error::Android37 emulator cannot discover AVD"
  exit 1
}

"$ANDROID_HOME/emulator/emulator" -avd dentalflow-api37 -no-window \
  -gpu swiftshader_indirect -feature -Vulkan -no-snapshot -noaudio \
  -no-boot-anim -camera-back none -partition-size 6144 \
  > android-emulator-api37.log 2>&1 &
EMULATOR_PID=$!
cleanup() {
  adb emu kill >/dev/null 2>&1 || true
  if kill -0 "$EMULATOR_PID" >/dev/null 2>&1; then
    kill "$EMULATOR_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

timeout 180 adb wait-for-device
READY=0
# The emulator's sys.boot_completed=1 does not mean its input service can
# accept key events. Retry the service + key event; never suppress a hard fail.
for attempt in $(seq 1 90); do
  boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  input="$(adb shell service check input 2>/dev/null || true)"
  if [[ "$boot" == "1" && "$input" == *"found"* ]]; then
    if adb shell input keyevent 82 >/dev/null 2>&1; then
      READY=1
      echo "Android API37 boot and input service ready after attempt $attempt"
      break
    fi
  fi
  sleep 2
done
if [[ "$READY" != 1 ]]; then
  echo "::error::Android API37 input service did not stabilize; app smoke was NOT executed."
  tail -n 100 android-emulator-api37.log || true
  exit 1
fi
# Keep the actual native app smoke unmodified; it must still fail if startup,
# login surface, filesystem access or native WebView is broken.
sh scripts/smoke-test-android.sh
