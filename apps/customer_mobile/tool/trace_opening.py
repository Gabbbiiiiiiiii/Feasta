"""Capture aggregate Flutter timeline costs; never save VM URLs or event arguments."""
import argparse
import collections
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
import urllib.request

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--device', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
adb = [str(Path(os.environ['LOCALAPPDATA']) / 'Android/sdk/platform-tools/adb.exe'), '-s', a.device]
def run(*args):
    return subprocess.check_output(adb + list(args), text=True, encoding='utf-8', errors='replace')
run('shell', 'am', 'force-stop', 'com.example.feasta')
capture = subprocess.Popen(adb + ['logcat', '-v', 'brief', '-T', '1', '-s', 'flutter:I', '*:S'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8', errors='replace')
service = []
def read():
    for line in capture.stdout:
        match = re.search(r'The Dart VM service is listening on (http://127\.0\.0\.1:\d+/\S+)', line)
        if match:
            service.append(match.group(1))
reader = threading.Thread(target=read, daemon=True)
reader.start()
forward = None
try:
    run('shell', 'am', 'start', '-W', '-n', 'com.example.feasta/.MainActivity', '--ez', 'trace-startup', 'true', '--ez', 'endless-trace-buffer', 'true')
    deadline = time.monotonic() + 20
    while not service and time.monotonic() < deadline:
        time.sleep(.1)
    if not service:
        raise RuntimeError('Profile VM service was not announced.')
    match = re.match(r'http://127\.0\.0\.1:(\d+)(/.*)', service[-1])
    forward = run('forward', 'tcp:0', 'tcp:' + match[1]).strip()
    time.sleep(8)
    with urllib.request.urlopen('http://127.0.0.1:' + forward + match[2] + 'getVMTimeline', timeout=20) as response:
        events = json.load(response)['result']['traceEvents']
    costs = collections.defaultdict(list)
    motion_costs = collections.defaultdict(list)
    stacks = collections.defaultdict(list)
    marks = {e.get('name'): e['ts'] for e in events
             if e.get('name', '').startswith('FEASTA opening:')}
    motion_start = marks.get('FEASTA opening: first_frame_rasterized_motion_start', float('inf'))
    motion_end = marks.get('FEASTA opening: opening_complete', float('-inf'))
    worst_motion = []
    def record(name, start, duration):
        # Type/engine event names only. Never persist arguments or keys.
        if not re.fullmatch(r'[A-Za-z_][A-Za-z_ .:<>/-]{0,100}', name):
            return
        costs[name].append(duration)
        if motion_start <= start <= motion_end:
            motion_costs[name].append(duration)
            if duration >= 16000:
                worst_motion.append({'name': name, 'motionOffsetUs': start - motion_start, 'durationUs': duration})
    for event in events:
        phase = event.get('ph')
        tid = event.get('tid')
        if phase == 'X':
            record(event.get('name', ''), event['ts'], event.get('dur', 0))
        elif phase == 'B':
            stacks[tid].append((event.get('name', ''), event['ts']))
        elif phase == 'E' and stacks[tid]:
            name, start = stacks[tid].pop()
            record(name, start, event['ts'] - start)
    def summarize(data):
        return sorted([{'name': n, 'count': len(v), 'totalUs': sum(v), 'maxUs': max(v)} for n, v in data.items()], key=lambda e: e['totalUs'], reverse=True)
    summary = {'wholeLaunch': summarize(costs), 'motion': summarize(motion_costs),
               'worstMotionSpans': sorted(worst_motion, key=lambda e: e['durationUs'], reverse=True)[:60]}
    Path(a.output).write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(f'Saved {len(costs)} sanitized event aggregates and motion attribution.')
except Exception:
    raise RuntimeError('Profile trace failed; private VM connection details withheld.') from None
finally:
    capture.terminate()
    capture.wait(timeout=10)
    if forward:
        run('forward', '--remove', 'tcp:' + forward)
