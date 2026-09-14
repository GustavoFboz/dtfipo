"""Exercise the non-debuggable release APK through Android accessibility."""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET

package = os.environ.get("DENTALFLOW_ANDROID_PACKAGE", "br.com.dentalflow.mobile")
def adb(*args):
    return subprocess.check_output(["adb", *args], text=True, timeout=30).strip()

def tree():
    adb("shell", "uiautomator", "dump", "/sdcard/dentalflow-release.xml")
    return ET.fromstring(adb("shell", "cat", "/sdcard/dentalflow-release.xml"))

def wait_text(text):
    for _ in range(15):
        root = tree()
        if any(text.casefold() in n.get("text", "").casefold() for n in root.iter("node")):
            return root
        time.sleep(1)
    raise AssertionError(f"Release UI never showed: {text}")

def tap(root, text):
    node = next(n for n in root.iter("node") if n.get("text", "").casefold() == text.casefold())
    x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds")))
    adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))

adb("shell", "pm", "grant", package, "android.permission.POST_NOTIFICATIONS")
adb("shell", "am", "force-stop", package)
adb("logcat", "-c")
launch = adb("shell", "am", "start", "-W", "-n", f"{package}/br.com.dentalflow.mobile.StartupActivity")
assert "Status: ok" in launch, launch
pid = adb("shell", "pidof", package)
assert pid
root = wait_text("Bem-vindo de volta.")
assert len([n for n in root.iter("node") if n.get("class") == "android.widget.EditText"]) >= 2, "Missing login inputs"
tap(root, "Criar conta")
root = wait_text("Tipo de conta")
tap(root, "Entrar")
wait_text("Bem-vindo de volta.")
adb("shell", "input", "keyevent", "KEYCODE_HOME")
time.sleep(2)
adb("shell", "am", "start", "-W", "-n", f"{package}/br.com.dentalflow.mobile.StartupActivity")
wait_text("Bem-vindo de volta.")
for _ in range(6):
    time.sleep(5)
    assert adb("shell", "pidof", package) == pid, "Release process restarted"
flags = adb("shell", "dumpsys", "package", package)
assert not re.search(r"(?:pkgFlags|flags)=\[[^\]]*DEBUGGABLE", flags), "Release must not be debuggable"
adb("shell", "uiautomator", "dump", "/sdcard/dentalflow-release.xml")
adb("pull", "/sdcard/dentalflow-release.xml", "android-release-ui.xml")
with open("android-release-startup.log", "w") as file:
    log = adb("logcat", "-d", "-v", "threadtime")
    file.write(log)
assert not re.search(r"FATAL EXCEPTION|JavaScript Error:|ANR in br\.com\.dentalflow", log), "Release startup errors"
print("Non-debuggable release: login, signup interaction, resume and process continuity passed.")
