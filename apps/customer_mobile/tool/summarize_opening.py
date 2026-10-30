"""Summarize sanitized cold-launch captures. Missing measurements remain null."""
import argparse
import json
from pathlib import Path
import re


def summarize(record):
    startup, native, opening = {}, {}, {}
    frames = {}
    for line in record['markers']:
        values = dict(re.findall(r'(\w+)=([\w.\-]+)', line))
        phase = values.get('phase')
        if line.startswith('FEASTA_STARTUP_NATIVE'):
            native[phase] = values
        elif line.startswith('FEASTA_STARTUP'):
            startup[phase] = values
        elif phase:
            opening[phase] = values
        else:
            frames = values

    def number(table, phase, key):
        value = table.get(phase, {}).get(key)
        return float(value) if value is not None else None

    def delta(table, end, start, key, scale=1):
        a, b = number(table, end, key), number(table, start, key)
        return round((a - b) / scale, 3) if a is not None and b is not None else None

    result = {'trial': record['trial'], 'androidFirstDrawProxyMs': record['androidTotalTimeMs']}
    for label, end, start in [
        ('processToActivityMs', 'activity_on_create', 'process_start'),
        ('activityToEngineConfigureMs', 'engine_configure_start', 'activity_on_create'),
        ('pluginRegistrationMs', 'plugins_registered', 'engine_configure_start'),
        ('activityToFlutterUiProxyMs', 'flutter_ui_displayed', 'activity_on_create'),
    ]:
        result[label] = delta(native, end, start, 'uptimeMs')
    for label, phase in [
        ('dartToPreparationMs', 'opening_prepare_start'),
        ('dartToArtworkMs', 'opening_artwork_decoded'),
        ('dartToControllerMs', 'first_raster_animation_start'),
        ('dartToFirstFlutterRasterMs', 'first_flutter_raster'),
        ('dartToFirstMotionRasterMs', 'first_motion_raster'),
    ]:
        value = number(startup, phase, 'dartElapsedUs')
        result[label] = round(value / 1000, 3) if value is not None else None
    for label, end, start in [
        ('artworkToPreparedFrameMs', 'opening_first_frame_built', 'opening_artwork_decoded'),
        ('allowFrameToControllerMs', 'first_raster_animation_start', 'allow_first_frame'),
        ('controllerToMotionRasterMs', 'first_motion_raster', 'first_raster_animation_start'),
    ]:
        result[label] = delta(startup, end, start, 'dartElapsedUs', 1000)
    vectors = [float(values['durationUs']) / 1000 for phase, values in startup.items()
               if phase.startswith('decode_') and phase.endswith('_end')]
    result['slowestVectorMs'] = round(max(vectors), 3) if vectors else None
    for label, phase in [('forkPrecacheMs', 'fork_precache_end'),
                         ('firebaseMs', 'firebase_initialize_end'),
                         ('appCheckMs', 'app_check_activate_end')]:
        value = number(startup, phase, 'durationUs')
        result[label] = round(value / 1000, 3) if value is not None else None
    result['destinationInitialBuildMs'] = delta(
        startup, 'destination_first_frame_built', 'destination_prepare_start', 'dartElapsedUs', 1000)
    result['animationWallMs'] = delta(
        opening, 'opening_complete', 'first_frame_rasterized_motion_start', 'elapsedMs')
    result['destinationFadeMs'] = delta(
        opening, 'opening_complete', 'destination_fade', 'elapsedMs')
    # A bounded clock correlation: never equate the delayed method-channel
    # response with Dart main. Includes platform-thread/round-trip uncertainty.
    link = startup.get('native_clock_link', {})
    motion = number(startup, 'first_motion_raster', 'dartElapsedUs')
    if motion is None:
        motion = number(startup, 'first_raster_animation_start', 'dartElapsedUs')
    activity = number(native, 'activity_on_create', 'sinceActivityMs')
    result['activityToMotionClockBoundsMs'] = None
    if link and motion is not None and activity is not None:
        result['activityToMotionClockBoundsMs'] = [
            round(float(link['nativeSinceActivityMs']) - activity +
                  (motion - float(link[key])) / 1000, 3)
            for key in ['dartReceiveUs', 'dartSendUs']
        ]
    extra = delta(startup, 'first_motion_raster', 'first_flutter_raster', 'dartElapsedUs', 1000)
    result['launchToMotionFirstDrawProxyMs'] = (
        round(record['androidTotalTimeMs'] + extra, 3)
        if record['androidTotalTimeMs'] is not None and extra is not None else None)
    for key in ['frames', 'overBudget', 'uiOverBudget', 'rasterOverBudget',
                'worstBuildMs', 'worstRasterMs', 'budgetMs', 'secureWaits']:
        result[key] = float(frames[key]) if key in frames else None
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    records = json.loads(Path(args.capture).read_text(encoding='utf-8'))
    Path(args.output).write_text(
        json.dumps([summarize(record) for record in records], indent=2) + '\n', encoding='utf-8')
