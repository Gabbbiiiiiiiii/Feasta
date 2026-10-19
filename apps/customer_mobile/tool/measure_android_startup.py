"""Cold-launch FEASTA without clearing data; export only sanitized timing markers."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--device', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--trials', type=int, default=3)
parser.add_argument('--observe-seconds', type=int, default=8)
parser.add_argument('--adb', default=str(Path(os.environ.get('LOCALAPPDATA', '')) / 'Android/sdk/platform-tools/adb.exe'))
args = parser.parse_args()
command = [args.adb, '-s', args.device]

def adb(*arguments):
    result = subprocess.run(command + list(arguments), capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError(f'ADB operation failed ({result.returncode}); no app data was removed.')
    return result.stdout

results = []
for trial in range(1, args.trials + 1):
    adb('shell', 'am', 'force-stop', 'com.example.feasta')
    # Capture live: a busy device can overwrite startup records in logcat's ring.
    capture = subprocess.Popen(command + ['logcat', '-v', 'brief', '-T', '1', '-s', 'FEASTA_STARTUP:I', 'flutter:I', '*:S'],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8', errors='replace',
                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    markers = []
    def read_markers():
        for line in capture.stdout:
            native = re.search(r'FEASTA_STARTUP.*?(phase=\S+ uptimeMs=\d+ sinceActivityMs=-?\d+)', line)
            dart = re.search(r'FEASTA_(?:STARTUP|OPENING) .*', line)
            if native:
                markers.append('FEASTA_STARTUP_NATIVE ' + native.group(1))
            elif dart:
                markers.append(dart.group(0).strip())
    reader = threading.Thread(target=read_markers, daemon=True)
    reader.start()
    launch = adb('shell', 'am', 'start', '-W', '-n', 'com.example.feasta/.MainActivity')
    time.sleep(args.observe_seconds)
    capture.terminate()
    capture.wait(timeout=10)
    reader.join(timeout=2)
    total = re.search(r'TotalTime:\s*(\d+)', launch)
    record = {'trial': trial, 'androidTotalTimeMs': int(total.group(1)) if total else None, 'markers': markers}
    results.append(record)
    Path(args.output).write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
    print(f'Trial {trial}: Android TotalTime={record["androidTotalTimeMs"]} ms; {len(markers)} sanitized markers.', flush=True)
