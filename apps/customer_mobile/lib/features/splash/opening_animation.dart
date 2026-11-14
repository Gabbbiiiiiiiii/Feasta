import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:vector_graphics/vector_graphics.dart' show AssetBytesLoader;

import '../../core/utils/startup_timings.dart';
import 'opening_diagnostics.dart';

const feastaOpeningBackground = Color(0xFFF7F8F8);

/// Presentation scheduling only; authentication continues outside this scope.
/// Expensive destination widgets mount after utensil motion has finished.
class OpeningDestination extends InheritedWidget {
  const OpeningDestination({
    required this.prepare,
    required super.child,
    super.key,
  });

  final bool prepare;

  static bool shouldPrepare(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<OpeningDestination>()
          ?.prepare ??
      true;

  @override
  bool updateShouldNotify(OpeningDestination oldWidget) =>
      prepare != oldWidget.prepare;
}

/// Mounted once above the app's navigator. The child initializes immediately;
/// this presentation layer never makes authentication or routing decisions.
class OpeningAnimation extends StatefulWidget {
  const OpeningAnimation({
    required this.child,
    this.destinationReady = true,
    this.onArtworkReady,
    this.onBrowse,
    this.presentationReady,
    super.key,
  });
  final Widget child;
  final bool destinationReady;
  final VoidCallback? onArtworkReady;
  final VoidCallback? onBrowse;

  /// Tests can control the engine/asset readiness boundary explicitly.
  /// Production waits for decoded artwork and the first rasterized frame.
  final Future<void>? presentationReady;

  @override
  State<OpeningAnimation> createState() => _OpeningAnimationState();
}

class _OpeningAnimationState extends State<OpeningAnimation>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    animationBehavior: AnimationBehavior.preserve,
    duration: const Duration(milliseconds: 4200),
  )..addListener(_tick);
  final _diagnostics = OpeningDiagnostics();
  final _artworkWidgets = <String, Widget>{};
  bool _holding = false;
  bool _released = false;
  bool _slow = false;
  Timer? _recoveryTimer;
  final _pictures = <String, PictureInfo>{};
  bool _preparing = false;
  bool _ready = false;
  bool _reducedMotion = false;
  int _visualStage = 0;
  int _presentationCheckpoint = 0;
  bool _checkpointPending = false;

  // A busy destination build must not consume the lettering and logo hold.
  // Stop at a visible reveal pose and the full logo, paint that frame, then
  // restart elapsed time. Normal frames retain the existing 4.2s choreography.
  static const _checkpoints = [0.76, 0.88];

  void _tick() {
    if (!_reducedMotion &&
        !_checkpointPending &&
        _presentationCheckpoint < _checkpoints.length &&
        _controller.value >= _checkpoints[_presentationCheckpoint]) {
      final boundary = _checkpoints[_presentationCheckpoint++];
      _checkpointPending = true;
      _controller.stop();
      _controller.value = boundary;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        StartupTimings.mark(
          boundary == 0.76
              ? 'lettering_frame_presented'
              : 'completed_wordmark_frame_presented',
        );
        _checkpointPending = false;
        if (!_holding && !_reducedMotion) _controller.forward();
      });
      return;
    }
    if (_controller.value > 0 && !_holding) _diagnostics.motionAdvanced();
    final stage = switch (_controller.value) {
      < 0.62 => 0,
      < 0.88 => 1,
      < 1 => 2,
      _ => 3,
    };
    if (stage != _visualStage) {
      _visualStage = stage;
      if (stage == 1) {
        StartupTimings.mark('destination_prepare_start');
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) StartupTimings.mark('destination_first_frame_built');
        });
      }
      setState(() {});
    }
    final boundary = _reducedMotion ? 1.0 : 0.94;
    if (!_released && !_holding && _controller.value >= boundary) {
      StartupTimings.mark('opening_destination_fade_boundary');
      if (widget.destinationReady) {
        _released = true;
      } else {
        _holding = true;
        _diagnostics.hold();
        _controller.stop();
        _controller.value = boundary;
        _recoveryTimer = Timer(const Duration(seconds: 15), () {
          if (mounted && _holding) setState(() => _slow = true);
        });
      }
      setState(() {});
    }
    if (!_holding) {
      _diagnostics.sample(_controller.value, reducedMotion: _reducedMotion);
    }
    if (_controller.isCompleted && !_holding) {
      _diagnostics.finish();
    }
  }

  @override
  void didUpdateWidget(OpeningAnimation oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_holding && widget.destinationReady) {
      _recoveryTimer?.cancel();
      _holding = false;
      _released = true;
      _diagnostics.resume();
      if (_reducedMotion) {
        _controller.value = 1;
      } else {
        _controller.forward();
      }
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduced = MediaQuery.disableAnimationsOf(context);
    final newlyReduced = reduced && !_reducedMotion;
    _reducedMotion = reduced;
    if (newlyReduced && _controller.value < 1) {
      _controller.stop();
      _controller.value = 0.86;
      if (_ready) _showStaticWordmark();
    }
    if (!_preparing) {
      _preparing = true;
      _preparePresentation();
    }
  }

  Future<void> _loadArtwork() async {
    await Future.wait<void>([
      StartupTimings.measure(
        'fork_precache',
        () => precacheImage(
          const AssetImage('assets/branding/feasta_fork.png'),
          context,
        ),
      ),
      for (final name in [
        'feasta_spoon',
        'feasta_knife',
        'feasta_assembled_f',
        'feasta_easta_only_aligned',
        'feasta_full_wordmark',
      ])
        StartupTimings.measure(
          'decode_$name',
          () => vg.loadPicture(
            AssetBytesLoader('assets/branding/$name.svg.vec'),
            context,
          ),
        ).then<void>((picture) {
          if (mounted) {
            _pictures[name] = picture;
          } else {
            picture.picture.dispose();
          }
        }),
    ]);
  }

  Future<void> _preparePresentation() async {
    try {
      StartupTimings.mark('opening_prepare_start');
      _diagnostics.beginPreparation();
      await (widget.presentationReady ?? _loadArtwork());
      if (!mounted) return;
      StartupTimings.mark('opening_artwork_decoded');
      setState(() => _ready = true);
      // Present the decoded starting poses before advancing the timeline.
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return;
      StartupTimings.mark('opening_first_frame_built');
      _diagnostics.artworkReady();
      widget.onArtworkReady?.call();
      // Only local artwork delays the first engine frame, never Firebase.
      if (widget.presentationReady == null) {
        await WidgetsBinding.instance.waitUntilFirstFrameRasterized;
      }
      if (!mounted) return;
      StartupTimings.mark('first_raster_animation_start');
      _diagnostics.startMotion(
        refreshRate: View.of(context).display.refreshRate,
      );
      if (_reducedMotion) {
        _showStaticWordmark();
      } else {
        _controller.forward(from: 0);
      }
    } catch (error, stack) {
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: error,
          stack: stack,
          library: 'FEASTA opening artwork',
        ),
      );
      // A decorative asset failure must not prevent secure startup/recovery.
      widget.onArtworkReady?.call();
      if (mounted) _controller.value = 1;
    }
  }

  void _showStaticWordmark() {
    _controller.value = 0.86;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        StartupTimings.mark('completed_wordmark_frame_presented');
      }
    });
    _controller.animateTo(1, duration: const Duration(milliseconds: 350));
  }

  @override
  void dispose() {
    _recoveryTimer?.cancel();
    _diagnostics.dispose();
    _controller.dispose();
    for (final picture in _pictures.values) {
      picture.picture.dispose();
    }
    super.dispose();
  }

  double _phase(double start, double end) => Curves.easeInOutCubic.transform(
    ((_controller.value - start) / (end - start)).clamp(0.0, 1.0),
  );

  Widget _svg(String name) {
    final picture = _pictures[name];
    // No SvgPicture.asset fallback: decoding belongs entirely to preparation,
    // never to a build or an animation frame.
    if (picture == null) return const SizedBox.shrink();
    return _artworkWidgets.putIfAbsent(
      name,
      () => RepaintBoundary(
        child: CustomPaint(painter: _ArtworkPainter(picture)),
      ),
    );
  }

  static const _forkArtwork = RepaintBoundary(
    child: Image(image: AssetImage('assets/branding/feasta_fork.png')),
  );

  /// Poses use the supplied artwork's 417 x 159 coordinate system.
  /// The official F opens outward, then follows curved return paths.
  Widget _utensil({
    required String name,
    required Offset finalCenter,
    required Size size,
    required Offset scattered,
    required Offset bend,
    required double flightAngle,
    required Widget artwork,
  }) {
    return Positioned(
      key: ValueKey('opening-$name'),
      left: finalCenter.dx - size.width / 2,
      top: finalCenter.dy - size.height / 2,
      width: size.width,
      height: size.height,
      child: AnimatedBuilder(
        animation: _controller,
        child: artwork,
        builder: (context, child) {
          final out = Curves.easeOutCubic.transform(
            (_controller.value / 0.34).clamp(0.0, 1.0),
          );
          final back = _phase(0.34, 0.59);
          final origin =
              Offset.lerp(finalCenter, scattered, out)! +
              bend * (4 * out * (1 - out));
          final center = back == 0
              ? origin
              : Offset.lerp(scattered, finalCenter, back)! +
                    bend * (4 * back * (1 - back));
          final angle = back == 0
              ? flightAngle * out
              : flightAngle * (1 - back);
          return Transform.translate(
            key: ValueKey('opening-$name-motion'),
            offset: center - finalCenter,
            child: Transform.rotate(angle: angle, child: child),
          );
        },
      ),
    );
  }

  // Keep the artwork/layout subtree stable. Only paint properties tick.
  Widget _opacity({
    Key? key,
    required double Function() value,
    required Widget child,
  }) => AnimatedBuilder(
    animation: _controller,
    child: child,
    builder: (context, child) =>
        Opacity(key: key, opacity: value(), child: child),
  );

  Widget _translation({
    required Key key,
    required Offset Function() value,
    required Widget child,
  }) => AnimatedBuilder(
    animation: _controller,
    child: child,
    builder: (context, child) =>
        Transform.translate(key: key, offset: value(), child: child),
  );

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      // Keep restoration and destination layout running, but avoid painting the
      // hidden Home (including image filters/gradients) during utensil flight.
      // Warm its paint during the existing completed-wordmark hold, before fade.
      RepaintBoundary(
        child: Offstage(
          offstage: _controller.value < 0.88,
          child: TickerMode(
            enabled: _released,
            child: OpeningDestination(
              prepare: _controller.value >= 0.62,
              child: widget.child,
            ),
          ),
        ),
      ),
      _buildOverlay(),
    ],
  );

  Widget _buildOverlay() => _diagnostics.overlayBuild(_buildOverlayContents);

  Widget _buildOverlayContents() {
    final t = _controller.value;
    // One F at t=0; never crossfade a stationary F over moving utensils.
    double assembled() => _controller.value == 0 ? 1.0 : _phase(0.59, 0.62);
    double reveal() => _phase(0.69, 0.83);
    // Preserve the original three-unit overshoot, using paint translation.
    double settle() => math.sin(_phase(0.79, 0.86) * math.pi) * 3;
    if (t >= 1 && !_holding) return const SizedBox.shrink();
    return Positioned.fill(
      child: _opacity(
        value: () => _reducedMotion || _holding ? 1 : 1 - _phase(0.94, 1),
        child: BlockSemantics(
          key: const ValueKey('feasta-opening-overlay'),
          child: Semantics(
            label: 'FEASTA is starting securely',
            child: Material(
              color: feastaOpeningBackground,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Center(
                    child: SizedBox(
                      // Native splash paints the same F at 96 logical pixels.
                      width: 417 * 96 / 177,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 360),
                        child: ExcludeSemantics(
                          child: FittedBox(
                            fit: BoxFit.contain,
                            child: SizedBox(
                              width: 417,
                              height: 300,
                              child: _translation(
                                key: const ValueKey('opening-centering'),
                                value: () => Offset(120 * (1 - reveal()), 70.5),
                                child: SizedBox(
                                  width: 417,
                                  height: 159,
                                  child: Stack(
                                    clipBehavior: Clip.none,
                                    children: [
                                      if (t < 0.88 && !_reducedMotion) ...[
                                        // Clip at the F's right edge: the
                                        // lettering emerges from behind it.
                                        Positioned(
                                          left: 159,
                                          top: 0,
                                          width: 258,
                                          height: 159,
                                          child: ClipRect(
                                            child: Stack(
                                              clipBehavior: Clip.none,
                                              children: [
                                                Positioned(
                                                  left: -159,
                                                  top: 0,
                                                  width: 417,
                                                  height: 159,
                                                  child: _translation(
                                                    key: const ValueKey(
                                                      'opening-lettering-motion',
                                                    ),
                                                    value: () => Offset(
                                                      -258 * (1 - reveal()) +
                                                          settle(),
                                                      0,
                                                    ),
                                                    child: _opacity(
                                                      key: const ValueKey(
                                                        'opening-lettering',
                                                      ),
                                                      value: () =>
                                                          reveal() == 0 ? 0 : 1,
                                                      child: _svg(
                                                        'feasta_easta_only_aligned',
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                        if (t < 0.62)
                                          _opacity(
                                            key: const ValueKey(
                                              'opening-utensils',
                                            ),
                                            value: () => 1 - assembled(),
                                            child: Stack(
                                              clipBehavior: Clip.none,
                                              children: [
                                                _utensil(
                                                  name: 'fork',
                                                  finalCenter: const Offset(
                                                    46.2391,
                                                    79.5,
                                                  ),
                                                  size: const Size(54, 159),
                                                  scattered: const Offset(
                                                    -45,
                                                    10,
                                                  ),
                                                  bend: const Offset(-30, 50),
                                                  flightAngle: 3.5,
                                                  artwork: _forkArtwork,
                                                ),
                                                _utensil(
                                                  name: 'spoon',
                                                  finalCenter: const Offset(
                                                    79.5,
                                                    78.5536,
                                                  ),
                                                  size: const Size(159, 53),
                                                  scattered: const Offset(
                                                    88,
                                                    202,
                                                  ),
                                                  bend: const Offset(70, 10),
                                                  flightAngle: 2.5,
                                                  artwork: _svg('feasta_spoon'),
                                                ),
                                                _utensil(
                                                  name: 'knife',
                                                  finalCenter: const Offset(
                                                    128.3804,
                                                    16.5,
                                                  ),
                                                  size: const Size(99, 33),
                                                  scattered: const Offset(
                                                    230,
                                                    -15,
                                                  ),
                                                  bend: const Offset(-15, -45),
                                                  flightAngle: 4.5,
                                                  artwork: _svg('feasta_knife'),
                                                ),
                                              ],
                                            ),
                                          ),
                                        Positioned(
                                          left: 0,
                                          top: 0,
                                          width: 177,
                                          height: 159,
                                          child: _opacity(
                                            key: const ValueKey(
                                              'opening-assembled-f',
                                            ),
                                            value: assembled,
                                            child: _svg('feasta_assembled_f'),
                                          ),
                                        ),
                                      ],
                                      Positioned(
                                        left: 0,
                                        top: 0,
                                        width: 417,
                                        height: 159,
                                        child: _opacity(
                                          key: const ValueKey(
                                            'opening-wordmark',
                                          ),
                                          value: () => _reducedMotion
                                              ? 1
                                              : _phase(0.86, 0.88),
                                          child: _svg('feasta_full_wordmark'),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (_holding && _slow)
                    Positioned(
                      left: 24,
                      right: 24,
                      bottom: 24,
                      height: 140,
                      child: SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              widget.onBrowse == null
                                  ? 'Startup is taking longer than expected. Please restart FEASTA.'
                                  : 'Startup is taking longer than expected. Please restart FEASTA or try browsing as a guest.',
                              textAlign: TextAlign.center,
                            ),
                            if (_slow && widget.onBrowse != null)
                              TextButton(
                                onPressed: widget.onBrowse,
                                child: const Text('Browse as guest'),
                              ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Paint already-decoded original vectors on the first engine frame.
class _ArtworkPainter extends CustomPainter {
  const _ArtworkPainter(this.artwork);
  final PictureInfo artwork;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = math.min(
      size.width / artwork.size.width,
      size.height / artwork.size.height,
    );
    canvas.save();
    canvas.translate(
      (size.width - artwork.size.width * scale) / 2,
      (size.height - artwork.size.height * scale) / 2,
    );
    canvas.scale(scale);
    canvas.drawPicture(artwork.picture);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_ArtworkPainter oldDelegate) =>
      oldDelegate.artwork != artwork;
}
