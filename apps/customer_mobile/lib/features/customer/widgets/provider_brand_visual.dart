import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radius.dart';
import '../../../shared/models/feasta_models.dart';

const customerDecorativeIconColor = Color(0xFF202525);

/// A bounded cover with a separate, uncropped business logo.
class ProviderBrandVisual extends StatelessWidget {
  const ProviderBrandVisual({
    super.key,
    required this.provider,
    this.height = 168,
    this.logoSize = 52,
    this.showVerification = false,
  });
  final ProviderModel provider;
  final double height;
  final double logoSize;
  final bool showVerification;

  @override
  Widget build(BuildContext context) {
    final cover = provider.coverImageUrl?.trim() ?? '';
    Widget fallback() => const ColoredBox(
      color: AppColors.surfaceMuted,
      child: Center(
        child: Icon(
          Icons.storefront_outlined,
          color: customerDecorativeIconColor,
          size: 32,
        ),
      ),
    );
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (cover.isEmpty)
            fallback()
          else
            Image.network(
              cover,
              fit: BoxFit.cover,
              semanticLabel: '${provider.businessName} cover image',
              errorBuilder: (_, _, _) => fallback(),
            ),
          Positioned(
            left: 10,
            bottom: 10,
            child: ProviderLogoBadge(provider: provider, size: logoSize),
          ),
          if (showVerification && provider.isApproved)
            const Positioned(
              right: 8,
              top: 8,
              child: Tooltip(
                message: 'Verified provider',
                child: CircleAvatar(
                  radius: 14,
                  backgroundColor: AppColors.surface,
                  child: Icon(
                    Icons.verified_rounded,
                    size: 18,
                    color: AppColors.success,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class ProviderLogoBadge extends StatelessWidget {
  const ProviderLogoBadge({
    super.key,
    required this.provider,
    this.size = 76,
    this.circular = false,
  });
  final ProviderModel provider;
  final double size;
  final bool circular;

  @override
  Widget build(BuildContext context) {
    final logo = provider.logoUrl?.trim() ?? '';
    Widget fallback() => Icon(
      Icons.storefront_outlined,
      color: customerDecorativeIconColor,
      size: size * 0.46,
      semanticLabel: '${provider.businessName} logo unavailable',
    );
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(circular ? 3 : 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(circular ? size : AppRadius.medium),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x18000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: circular
          ? _CircularProviderLogo(
              url: logo,
              label: '${provider.businessName} logo',
              fallback: fallback(),
            )
          : ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.small),
              child: logo.isEmpty
                  ? fallback()
                  : Image.network(
                      logo,
                      fit: BoxFit.contain,
                      semanticLabel: '${provider.businessName} logo',
                      errorBuilder: (_, _, _) => fallback(),
                    ),
            ),
    );
  }
}

typedef _LogoBounds = ({double x, double y, double radius});

_LogoBounds _wholeLogo(int width, int height) => (
  x: width / 2,
  y: height / 2,
  radius: math.sqrt(width * width + height * height) / 2,
);

Future<_LogoBounds> _measureLogo(ui.Image image) async {
  if (image.width * image.height > 8 * 1024 * 1024) {
    return _wholeLogo(image.width, image.height);
  }
  final bytes = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
  if (bytes == null) return _wholeLogo(image.width, image.height);
  // Pixel inspection runs off the UI isolate, including larger uploaded logos.
  return compute(_measureLogoPixels, (
    image.width,
    image.height,
    bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
  ));
}

/// Locate foreground without changing the uploaded image. Only a coherent
/// opaque border palette or an entirely transparent border is treated as space.
_LogoBounds _measureLogoPixels((int, int, Uint8List) input) {
  final (width, height, pixels) = input;
  final minimum = [255, 255, 255];
  final maximum = [0, 0, 0];
  var transparent = true;
  var opaque = true;
  void sample(int x, int y) {
    final at = (width * y + x) * 4;
    transparent = transparent && pixels[at + 3] == 0;
    opaque = opaque && pixels[at + 3] == 255;
    for (var channel = 0; channel < 3; channel++) {
      minimum[channel] = math.min(minimum[channel], pixels[at + channel]);
      maximum[channel] = math.max(maximum[channel], pixels[at + channel]);
    }
  }

  for (var x = 0; x < width; x++) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (var y = 0; y < height; y++) {
    sample(0, y);
    sample(width - 1, y);
  }
  // Inner corner samples account for thin export frames without treating
  // lettering near the middle of an image edge as background.
  for (final fraction in [0.01, 0.02]) {
    final x = ((width - 1) * fraction).round();
    final y = ((height - 1) * fraction).round();
    sample(x, y);
    sample(width - 1 - x, y);
    sample(x, height - 1 - y);
    sample(width - 1 - x, height - 1 - y);
  }
  final uniform = List.generate(
    3,
    (c) => maximum[c] - minimum[c],
  ).every((range) => range <= 8);
  final light =
      minimum.every((value) => value >= 180) &&
      List.generate(
        3,
        (c) => maximum[c] - minimum[c],
      ).every((range) => range <= 48);
  if (!transparent && !(opaque && (uniform || light))) {
    return _wholeLogo(width, height);
  }
  bool isArtwork(int at) {
    if (transparent) return pixels[at + 3] != 0;
    if (pixels[at + 3] != 255) return true;
    for (var c = 0; c < 3; c++) {
      if (pixels[at + c] < minimum[c] - 4 || pixels[at + c] > maximum[c] + 4) {
        return true;
      }
    }
    return false;
  }

  var left = width, top = height, right = -1, bottom = -1;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      if (!isArtwork((width * y + x) * 4)) continue;
      left = math.min(left, x);
      right = math.max(right, x);
      top = math.min(top, y);
      bottom = math.max(bottom, y);
    }
  }
  if (right < left) return _wholeLogo(width, height);
  final centerX = (left + right + 1) / 2;
  final centerY = (top + bottom + 1) / 2;
  var radiusSquared = 0.0;
  for (var y = top; y <= bottom; y++) {
    for (var x = left; x <= right; x++) {
      if (!isArtwork((width * y + x) * 4)) continue;
      // Include the complete source pixel, not just its center.
      final dx = (x + 0.5 - centerX).abs() + 0.5;
      final dy = (y + 0.5 - centerY).abs() + 0.5;
      radiusSquared = math.max(radiusSquared, dx * dx + dy * dy);
    }
  }
  return (
    x: centerX,
    y: centerY,
    radius: math.max(1.0, math.sqrt(radiusSquared)),
  );
}

class _CircularProviderLogo extends StatefulWidget {
  const _CircularProviderLogo({
    required this.url,
    required this.label,
    required this.fallback,
  });
  final String url;
  final String label;
  final Widget fallback;

  @override
  State<_CircularProviderLogo> createState() => _CircularProviderLogoState();
}

class _CircularProviderLogoState extends State<_CircularProviderLogo> {
  ImageStream? _stream;
  ImageStreamListener? _listener;
  int _generation = 0;
  bool _measured = false;
  Size _sourceSize = const Size(1, 1);
  _LogoBounds _bounds = _wholeLogo(1, 1);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  @override
  void didUpdateWidget(covariant _CircularProviderLogo oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) _resolve();
  }

  void _resolve() {
    final next = widget.url.isEmpty
        ? null
        : NetworkImage(
            widget.url,
          ).resolve(createLocalImageConfiguration(context));
    if (next?.key == _stream?.key) return;
    if (_listener != null) _stream?.removeListener(_listener!);
    _stream = next;
    final generation = ++_generation;
    _measured = false;
    _sourceSize = const Size(1, 1);
    _bounds = _wholeLogo(1, 1);
    _listener = ImageStreamListener((info, synchronousCall) async {
      final source = Size(
        info.image.width.toDouble(),
        info.image.height.toDouble(),
      );
      var bounds = _wholeLogo(info.image.width, info.image.height);
      try {
        bounds = await _measureLogo(info.image);
      } catch (_) {
        // Unknown artwork uses the same fitting rule with complete-image bounds.
      } finally {
        info.dispose();
      }
      if (!mounted || generation != _generation) return;
      setState(() {
        _measured = true;
        _sourceSize = source;
        _bounds = bounds;
      });
    }, onError: (Object error, StackTrace? stack) {});
    next?.addListener(_listener!);
  }

  @override
  void dispose() {
    _generation++;
    if (_listener != null) _stream?.removeListener(_listener!);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: widget.url.isEmpty
          ? Center(child: widget.fallback)
          : LayoutBuilder(
              builder: (context, constraints) {
                final diameter = constraints.maxWidth;
                // One rule for every logo: foreground reaches 92% of the
                // circle radius, leaving the same 8% radial breathing room.
                final scale = diameter * 0.46 / _bounds.radius;
                final width = _sourceSize.width * scale;
                final height = _sourceSize.height * scale;
                return OverflowBox(
                  minWidth: 0,
                  minHeight: 0,
                  maxWidth: double.infinity,
                  maxHeight: double.infinity,
                  child: Transform.translate(
                    key: _measured
                        ? const ValueKey('logo-fitted-artwork')
                        : null,
                    offset: Offset(
                      (_sourceSize.width / 2 - _bounds.x) * scale,
                      (_sourceSize.height / 2 - _bounds.y) * scale,
                    ),
                    child: SizedBox(
                      width: width,
                      height: height,
                      child: Image.network(
                        widget.url,
                        fit: BoxFit.contain,
                        semanticLabel: widget.label,
                        errorBuilder: (_, _, _) =>
                            Center(child: widget.fallback),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
