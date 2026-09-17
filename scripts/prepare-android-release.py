"""Configure the generated shell without changing shared product operations."""
from pathlib import Path
import os
import re
import xml.etree.ElementTree as ET

VERSION = "0.2.2"
gradle = Path("android/app/build.gradle")
source = gradle.read_text()
source, count = re.subn(r'versionCode\s+\d+', 'versionCode 4', source)
assert count == 1, "Expected one Android versionCode"
source, count = re.subn(r'versionName\s+[\"\'][^\"\']+[\"\']', f'versionName "{VERSION}"', source)
assert count == 1, "Expected one Android versionName"

# Optional parallel package allows diagnosis without uninstalling a legacy APK
# whose disposable debug signing key was not retained. It never opens or erases
# the legacy package's private cache, and uses the normal Cloud identity flow.
parallel = os.environ.get("DENTALFLOW_ANDROID_PARALLEL") == "true"
if parallel:
    source, count = re.subn(r'applicationId\s+"br\.com\.dentalflow\.mobile"',
                           'applicationId "br.com.dentalflow.mobile.preview"', source)
    assert count == 1, "Unexpected applicationId for parallel build"
# Both CI variants use the same AGP-managed temporary certificate, so release
# can be installed over debug for runtime verification. Delivery is re-signed
# with the retained private certificate outside CI.
source += "\nandroid.buildTypes.release.signingConfig = android.signingConfigs.debug\n"
gradle.write_text(source)

android = "{http://schemas.android.com/apk/res/android}"
ET.register_namespace("android", android[1:-1])
path = Path("android/app/src/main/AndroidManifest.xml")
tree = ET.parse(path)
app = tree.getroot().find("application")
assert app is not None
main = next(a for a in app.findall("activity") if a.get(android + "name") in (".MainActivity", "br.com.dentalflow.mobile.MainActivity"))
main.set(android + "name", "br.com.dentalflow.mobile.MainActivity")
startup = ET.SubElement(app, "activity", {
    android + "name": "br.com.dentalflow.mobile.StartupActivity",
    android + "exported": "true",
    android + "theme": "@android:style/Theme.Material.Light.NoActionBar",
    android + "label": "@string/app_name",
})
for intent in list(main.findall("intent-filter")):
    if any(c.get(android + "name") == "android.intent.category.LAUNCHER" for c in intent.findall("category")):
        main.remove(intent)
        startup.append(intent)
tree.write(path, encoding="utf-8", xml_declaration=True)
if parallel:
    strings = Path("android/app/src/main/res/values/strings.xml")
    tree = ET.parse(strings)
    for item in tree.getroot().findall("string"):
        if item.get("name") in ("app_name", "title_activity_main"):
            item.text = f"DentalFlow {VERSION}"
    tree.write(strings, encoding="utf-8", xml_declaration=True)
print(f"Prepared Android {VERSION}; parallel installation: {parallel}")
