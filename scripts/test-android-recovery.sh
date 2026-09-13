#!/bin/sh
set -eu
package="${DENTALFLOW_ANDROID_PACKAGE:-br.com.dentalflow.mobile}"
activity="$package/br.com.dentalflow.mobile.StartupActivity"

# Intentional failure injection is kept separate from the clean-start gate.
adb logcat -c
adb shell am crash "$package"
sleep 4
adb shell am force-stop "$package"
adb shell am start -W -n "$activity" > android-recovery-launch.log
sleep 2
adb shell uiautomator dump /sdcard/dentalflow-recovery.xml
adb pull /sdcard/dentalflow-recovery.xml android-recovery.xml
python - <<'PY'
import re
import subprocess
import xml.etree.ElementTree as ET
root = ET.parse('android-recovery.xml').getroot()
texts = [node.get('text', '') for node in root.iter('node')]
assert any('Vamos reabrir o DentalFlow' in text for text in texts), texts
assert any('Falha nativa:' in text for text in texts), 'Native exception was not recorded'
assert any('Compartilhar diagnóstico' in text for text in texts), 'No cable-free diagnostic action'
retry = next(node for node in root.iter('node') if node.get('text') == 'Tentar novamente')
x1, y1, x2, y2 = map(int, re.findall(r'\d+', retry.get('bounds')))
subprocess.run(['adb', 'shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2)], check=True)
PY
sleep 3
# The recovered process must render and interact normally again.
bun scripts/test-android-webview.mjs
adb logcat -d -v threadtime > android-recovery-injected.log
echo "Native exception recorded; recovery UI and retry passed without USB."
