#!/bin/sh
set -eu

package="br.com.dentalflow.mobile"
if [ "${DENTALFLOW_ANDROID_PARALLEL:-false}" = true ]; then package="$package.preview"; fi
export DENTALFLOW_ANDROID_PACKAGE="$package"
activity="$package/br.com.dentalflow.mobile.StartupActivity"
apk="android/app/build/outputs/apk/debug/app-debug.apk"
startup_log="android-startup.log"

collect_diagnostics() {
  adb logcat -d -v threadtime > "$startup_log" 2>&1 || true
  adb logcat -b crash -d -v threadtime > android-crash.log 2>&1 || true
  adb shell dumpsys activity activities > android-activities.log 2>&1 || true
  adb shell dumpsys activity exit-info "$package" > android-exit-info.log 2>&1 || true
  adb shell dumpsys webviewupdate > android-webview.log 2>&1 || true
  adb exec-out screencap -p > android-startup.png 2>/dev/null || true
  cat android-crash.log android-exit-info.log || true
  grep -E -A 20 -B 3 'AndroidRuntime|Capacitor|FATAL|ANR in br.com.dentalflow' "$startup_log" | tail -n 250 || true
}
trap collect_diagnostics EXIT

test -s "$apk"
adb install -r "$apk"
adb logcat -c
adb shell am force-stop "$package"
adb shell am start -W -n "$activity" > android-launch.log 2>&1
cat android-launch.log
# am start may return exit code zero even when the launch timed out.
if ! grep -Eq '^Status: ok[[:space:]]*$' android-launch.log; then
  echo "Android did not confirm a successful Activity launch."
  exit 1
fi

pid="$(adb shell pidof "$package" | tr -d '\r' || true)"
test -n "$pid"
# Observe asynchronous startup, then exercise a background/foreground cycle.
for phase in 1 2; do
  for sample in 1 2 3 4 5 6; do
    sleep 5
    current_pid="$(adb shell pidof "$package" | tr -d '\r' || true)"
    if [ "$current_pid" != "$pid" ]; then
      echo "Android process exited or restarted during startup/resume."
      exit 1
    fi
  done
  if [ "$phase" = 1 ]; then
    adb shell input keyevent KEYCODE_HOME
    sleep 2
    adb shell am start -W -n "$activity" > android-resume.log 2>&1
    grep -Eq '^Status: ok[[:space:]]*$' android-resume.log
  fi
done

bun scripts/test-android-webview.mjs
collect_diagnostics
if grep -Eq 'FATAL EXCEPTION|Fatal signal|ANR in br\.com\.dentalflow\.mobile|E Capacitor: JavaScript Error:' "$startup_log"; then
  echo "Android runtime failure detected; inspect diagnostic artifacts."
  exit 1
fi
echo "Activity launch and process continuity passed; this is not proof of functional login."
cp android-startup.log android-clean-startup.log
cp android-crash.log android-clean-crash.log
sh scripts/test-android-recovery.sh
