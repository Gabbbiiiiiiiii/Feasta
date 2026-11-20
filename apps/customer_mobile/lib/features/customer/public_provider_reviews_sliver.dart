import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart' show Timestamp;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../presentation/widgets/provider_review_card.dart';

/// Displays reviews validated and published by the existing FEASTA Web API.
class PublicProviderReviewsSliver extends StatefulWidget {
  const PublicProviderReviewsSliver({
    required this.providerId,
    this.client,
    this.webBaseUrl,
    super.key,
  });

  final String providerId;
  final http.Client? client;
  final String? webBaseUrl;

  @override
  State<PublicProviderReviewsSliver> createState() =>
      _PublicProviderReviewsSliverState();
}

class _PublicProviderReviewsSliverState
    extends State<PublicProviderReviewsSliver> {
  static const _configuredOrigin = String.fromEnvironment(
    'FEASTA_WEB_BASE_URL',
    defaultValue: 'https://feasta-web.vercel.app',
  );

  late http.Client _client;
  late bool _ownsClient;

  final List<Map<String, dynamic>> _reviews = [];
  final Set<String> _reviewIds = {};
  final Set<String> _completedCursors = {};

  bool _busy = false;
  bool _started = false;
  bool _failed = false;
  String? _nextCursor;
  int _generation = 0;

  Uri? get _origin {
    final value = (widget.webBaseUrl ?? _configuredOrigin).trim();
    final uri = Uri.tryParse(value);

    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      return null;
    }

    return uri;
  }

  @override
  void initState() {
    super.initState();
    _ownsClient = widget.client == null;
    _client = widget.client ?? http.Client();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  @override
  void didUpdateWidget(covariant PublicProviderReviewsSliver oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.client != widget.client) {
      if (_ownsClient) _client.close();
      _ownsClient = widget.client == null;
      _client = widget.client ?? http.Client();
    }

    if (oldWidget.providerId != widget.providerId ||
        oldWidget.webBaseUrl != widget.webBaseUrl ||
        oldWidget.client != widget.client) {
      _generation++;
      _reviews.clear();
      _reviewIds.clear();
      _completedCursors.clear();
      _nextCursor = null;
      _started = false;
      _failed = false;
      _busy = false;

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _load();
      });
    }
  }

  @override
  void dispose() {
    _generation++;
    if (_ownsClient) _client.close();
    super.dispose();
  }

  Future<void> _load() async {
    if (!mounted || _busy) return;

    if (_started && _nextCursor == null && !_failed) {
      return;
    }

    final origin = _origin;
    final providerId = widget.providerId;
    final generation = _generation;

    if (origin == null ||
        !RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(providerId)) {
      setState(() => _failed = true);
      return;
    }

    final cursor = _started ? _nextCursor : null;

    if (cursor != null && _completedCursors.contains(cursor)) {
      setState(() => _nextCursor = null);
      return;
    }

    final url = origin.replace(
      path: '/customer/providers/${Uri.encodeComponent(providerId)}/reviews',
      query: null,
      queryParameters: cursor == null ? null : {'cursor': cursor},
    );

    setState(() {
      _busy = true;
      _failed = false;
    });

    try {
      final response = await _client
          .get(url)
          .timeout(const Duration(seconds: 20));

      if (response.statusCode != 200) {
        assert(() {
          debugPrint(
            '[FEASTA REVIEWS] HTTP status: ${response.statusCode}; '
            'content-type: ${response.headers['content-type'] ?? 'unknown'}',
          );
          return true;
        }());
        throw const FormatException('Review request failed.');
      }

      final decoded = jsonDecode(utf8.decode(response.bodyBytes));

      if (decoded is! Map<String, dynamic> || decoded['reviews'] is! List) {
        throw const FormatException('Invalid review page.');
      }

      final rawNext = decoded['nextCursor'];

      if (rawNext != null &&
          (rawNext is! String ||
              rawNext.isEmpty ||
              rawNext.length > 1000 ||
              !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(rawNext))) {
        throw const FormatException('Invalid review cursor.');
      }

      final incoming = <Map<String, dynamic>>[];

      for (final item in decoded['reviews'] as List) {
        if (item is! Map<String, dynamic>) {
          throw const FormatException('Invalid review item.');
        }

        final id = item['id'];
        final rating = item['rating'];
        final comment = item['comment'];
        final createdAt = item['createdAt'];
        final reply = item['providerReply'];

        if (id is! String ||
            !RegExp(r'^[A-Za-z0-9_-]{1,160}$').hasMatch(id) ||
            rating is! int ||
            rating < 1 ||
            rating > 5 ||
            comment is! String ||
            createdAt is! String ||
            (reply != null && reply is! String)) {
          throw const FormatException('Invalid review fields.');
        }

        final parsedDate = DateTime.tryParse(createdAt);
        if (parsedDate == null) {
          throw const FormatException('Invalid review date.');
        }

        incoming.add({
          'id': id,
          'customerFirstName': 'Verified',
          'customerLastName': 'customer',
          'rating': rating,
          'comment': comment,
          'createdAt': Timestamp.fromDate(parsedDate),
          'providerReply': reply ?? '',
        });
      }

      if (!mounted ||
          generation != _generation ||
          providerId != widget.providerId) {
        return;
      }

      setState(() {
        if (cursor != null) _completedCursors.add(cursor);

        for (final review in incoming) {
          final id = review['id'] as String;
          if (_reviewIds.add(id)) {
            _reviews.add(review);
          }
        }

        _started = true;
        _nextCursor = rawNext as String?;

        if (_nextCursor != null && _completedCursors.contains(_nextCursor)) {
          _nextCursor = null;
        }
      });
    } catch (error) {
      assert(() {
        debugPrint('[FEASTA REVIEWS] Error type: ${error.runtimeType}');
        debugPrint('[FEASTA REVIEWS] Error: $error');
        debugPrint('[FEASTA REVIEWS] Provider ID: $providerId');
        debugPrint('[FEASTA REVIEWS] API host: ${origin.host}');
        return true;
      }());
      if (mounted && generation == _generation) {
        setState(() => _failed = true);
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Ratings & Reviews',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text('Reviews from verified bookings'),
            const SizedBox(height: 16),

            if (_busy && !_started) const _ReviewsLoadingSkeleton(),

            for (final review in _reviews) ...[
              ProviderReviewCard(
                key: ValueKey('public-review-${review['id']}'),
                data: review,
              ),
              const SizedBox(height: 12),
            ],

            if (_started &&
                !_busy &&
                !_failed &&
                _reviews.isEmpty &&
                _nextCursor == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('No customer reviews yet.')),
              ),

            if (_failed) ...[
              const Text('Reviews are unavailable. Please try again.'),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: _busy ? null : _load,
                child: const Text('Retry reviews'),
              ),
            ],

            if (_started && !_failed && _nextCursor != null)
              OutlinedButton(
                onPressed: _busy ? null : _load,
                child: Text(_busy ? 'Loading reviews...' : 'Load more reviews'),
              ),

            if (_busy && _started)
              const Padding(
                padding: EdgeInsets.all(8),
                child: _ReviewsLoadingSkeleton(),
              ),
          ],
        ),
      ),
    );
  }
}

class _ReviewsLoadingSkeleton extends StatelessWidget {
  const _ReviewsLoadingSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const ValueKey('public-reviews-loading-skeleton'),
      padding: const EdgeInsets.fromLTRB(0, 6, 0, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SkeletonBox(width: 116, height: 14, radius: 7),
          SizedBox(height: 12),
          _ReviewSkeletonCard(),
          SizedBox(height: 10),
          _ReviewSkeletonCard(),
        ],
      ),
    );
  }
}

class _ReviewSkeletonCard extends StatelessWidget {
  const _ReviewSkeletonCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FBF9),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE3ECE7)),
      ),
      child: const Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _SkeletonBox(width: 105, height: 12, radius: 6),
              SizedBox(width: 10),
              _SkeletonBox(width: 76, height: 12, radius: 6),
            ],
          ),
          SizedBox(height: 10),
          _SkeletonBox(width: 90, height: 12, radius: 6),
          SizedBox(height: 8),
          _SkeletonBox(width: double.infinity, height: 12, radius: 6),
        ],
      ),
    );
  }
}

class _SkeletonBox extends StatelessWidget {
  const _SkeletonBox({
    required this.width,
    required this.height,
    required this.radius,
  });

  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width == double.infinity ? null : width,
      constraints: width == double.infinity
          ? const BoxConstraints(minWidth: double.infinity)
          : null,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFFE7EFEA),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}
