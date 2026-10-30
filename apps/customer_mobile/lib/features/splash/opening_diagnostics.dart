import 'dart:async';
import 'dart:developer' as developer;
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';

import '../../core/utils/startup_timings.dart';

/// Opt-in profile diagnostics. No per-frame logging or release-build timing collection.
/// Frame timestamps, rather than callback delivery time, identify active motion.
class OpeningDiagnostics {
  static const _enabled =
      !kReleaseMode && bool.fromEnvironment('FEASTA_OPENING_DIAGNOSTICS');

  final _clock = Stopwatch();
  final _frames = <FrameTiming>[];
  final _holds = <(int, int?)>[];
  int? _motionStart;
  int? _motionEnd;
  int? _firstMotionRaster;
  int? _firstAdvance;
  bool _firstRasterReported = false;
  double _budgetUs = 1000000 / 60;
  Timer? _flush;
  bool _attached = false;
  String? _stage;
  int _overlayBuilds = 0;
  int _overlayBuildUs = 0;
  int _worstOverlayBuildUs = 0;

  T overlayBuild<T>(T Function() build) {
    if (!_enabled) return build();
    final start = developer.Timeline.now;
    developer.Timeline.startSync('FEASTA opening overlay build');
    try {
      return build();
    } finally {
      final duration = developer.Timeline.now - start;
      _overlayBuilds++;
      _overlayBuildUs += duration;
      if (duration > _worstOverlayBuildUs) _worstOverlayBuildUs = duration;
      developer.Timeline.finishSync();
    }
  }

  void beginPreparation() {
    if (!_enabled) return;
    _clock.start();
    _mark('preparing');
    SchedulerBinding.instance.addTimingsCallback(_onTimings);
    _attached = true;
  }

  void artworkReady() => _mark('artwork_ready');

  void startMotion({double refreshRate = 60}) {
    if (!_enabled) return;
    _budgetUs = 1000000 / (refreshRate > 0 ? refreshRate : 60);
    _motionStart = developer.Timeline.now;
    _mark('first_frame_rasterized_motion_start');
  }

  void motionAdvanced() {
    if (!_enabled || _motionStart == null) return;
    _firstAdvance ??= developer.Timeline.now;
  }

  void hold() {
    if (!_enabled) return;
    _holds.add((developer.Timeline.now, null));
    _mark('waiting_for_secure_destination');
  }

  void resume() {
    if (!_enabled) return;
    if (_holds.isNotEmpty && _holds.last.$2 == null) {
      _holds[_holds.length - 1] = (_holds.last.$1, developer.Timeline.now);
    }
    _mark('destination_ready_fade');
  }

  void sample(double progress, {required bool reducedMotion}) {
    if (!_enabled || _motionStart == null) return;
    final stage = reducedMotion
        ? 'reduced_motion'
        : switch (progress) {
            < 0.34 => 'utensils_out',
            < 0.59 => 'utensils_return',
            < 0.62 => 'reassembly',
            < 0.69 => 'assembled_before_lettering',
            < 0.83 => 'lettering_reveal',
            < 0.88 => 'wordmark_settle',
            < 0.94 => 'completed_wordmark_hold',
            _ => 'destination_fade',
          };
    if (stage == _stage) return;
    _stage = stage;
    _mark(stage);
  }

  void _mark(String phase) {
    if (!_enabled) return;
    developer.Timeline.instantSync('FEASTA opening: $phase');
    debugPrint(
      'FEASTA_OPENING phase=$phase elapsedMs=${_clock.elapsedMilliseconds}',
    );
  }

  void _onTimings(List<FrameTiming> timings) {
    _frames.addAll(timings);
    for (final frame in timings) {
      if (!_firstRasterReported) {
        _firstRasterReported = true;
        StartupTimings.markFrame(
          'first_flutter_raster',
          frame.timestampInMicroseconds(FramePhase.rasterFinish),
        );
      }
      if (_firstMotionRaster == null &&
          _firstAdvance != null &&
          frame.timestampInMicroseconds(FramePhase.buildFinish) >=
              _firstAdvance!) {
        _firstMotionRaster = frame.timestampInMicroseconds(
          FramePhase.rasterFinish,
        );
        // Engine raster completion is a presentation proxy, not a measurement
        // of Android's compositor or the physical display scanout.
        StartupTimings.markFrame('first_motion_raster', _firstMotionRaster!);
      }
    }
  }

  void finish() {
    if (!_enabled || _motionEnd != null) return;
    _motionEnd = developer.Timeline.now;
    _mark('opening_complete');
    // Engine timing callbacks are batched. This never delays the UI or Home.
    _flush = Timer(const Duration(seconds: 1), _reportAndDetach);
  }

  void _reportAndDetach() {
    if (!_attached) return;
    SchedulerBinding.instance.removeTimingsCallback(_onTimings);
    _attached = false;
    var active = 0;
    var overBudget = 0;
    var uiOverBudget = 0;
    var rasterOverBudget = 0;
    var worstBuild = 0;
    var worstRaster = 0;
    var worstVsync = 0;
    var lateVsync = 0;
    for (final frame in _frames) {
      final time = frame.timestampInMicroseconds(FramePhase.buildStart);
      if (_motionStart == null ||
          time < _motionStart! ||
          (_motionEnd != null && time > _motionEnd!) ||
          _holds.any(
            (hold) => time >= hold.$1 && (hold.$2 == null || time <= hold.$2!),
          )) {
        continue;
      }
      active++;
      final build = frame.buildDuration.inMicroseconds;
      final raster = frame.rasterDuration.inMicroseconds;
      final vsync = frame.vsyncOverhead.inMicroseconds;
      if (vsync > worstVsync) worstVsync = vsync;
      if (vsync > _budgetUs) lateVsync++;
      if (build > worstBuild) worstBuild = build;
      if (raster > worstRaster) worstRaster = raster;
      if (build > _budgetUs) uiOverBudget++;
      if (raster > _budgetUs) rasterOverBudget++;
      if (build > _budgetUs || raster > _budgetUs) overBudget++;
    }
    debugPrint(
      'FEASTA_OPENING frames=$active overBudget=$overBudget '
      'uiOverBudget=$uiOverBudget rasterOverBudget=$rasterOverBudget '
      'budgetMs=${(_budgetUs / 1000).toStringAsFixed(2)} '
      'worstBuildMs=${(worstBuild / 1000).toStringAsFixed(2)} '
      'worstRasterMs=${(worstRaster / 1000).toStringAsFixed(2)} '
      'worstVsyncMs=${(worstVsync / 1000).toStringAsFixed(2)} '
      'lateVsync=$lateVsync secureWaits=${_holds.length} '
      'overlayBuilds=$_overlayBuilds overlayBuildUs=$_overlayBuildUs '
      'worstOverlayBuildUs=$_worstOverlayBuildUs',
    );
    _frames.clear();
  }

  void dispose() {
    _flush?.cancel();
    if (_enabled) _reportAndDetach();
  }
}
