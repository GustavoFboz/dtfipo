#!/bin/sh
set -eu

package="br.com.dentalflow.mobile"
activity="br.com.dentalflow.mobile/.MainActivity"
apk="android/app/build/outputs/apk/debug/app-debug.apk"
startup_log="android-startup.log"

test -s "$apk"
adb install -r "$apk"
adb logcat -c
adb shell am force-stop "$package" || true
adb shell am start -W -n "$activity"
sleep 8

pid="$(adb shell pidof "$package" | tr -d '\r' || true)"
if [ -z "$pid" ]; then
  echo "DentalFlow Android process exited during startup."
  adb logcat -d -v threadtime | tail -n 500
  exit 1
fi

adb shell dumpsys activity activities | grep -F "$package" >/dev/null
adb logcat -d -v threadtime > "$startup_log"
if grep -E "FATAL EXCEPTION|Process: br\.com\.dentalflow\.mobile.*has died" "$startup_log"; then
  echo "Fatal Android startup error detected."
  tail -n 500 "$startup_log"
  exit 1
fi

echo "DentalFlow Android stayed alive after cold launch (pid $pid)."
