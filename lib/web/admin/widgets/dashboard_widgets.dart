import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

DateTime? _extractDate(dynamic raw) {
  if (raw == null) return null;
  if (raw is Timestamp) return raw.toDate();
  if (raw is DateTime) return raw;
  if (raw is int) return DateTime.fromMillisecondsSinceEpoch(raw);
  if (raw is String) {
    try {
      return DateTime.parse(raw);
    } catch (_) {
      return null;
    }
  }
  return null;
}

String _timeAgo(DateTime dt) {
  final now = DateTime.now();
  final diff = now.difference(dt);
  if (diff.inSeconds < 60) return '${diff.inSeconds}s';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 30) return '${diff.inDays}d';
  final months = (diff.inDays / 30).floor();
  if (months < 12) return '${months}mo';
  final years = (months / 12).floor();
  return '${years}y';
}

class StatData {
  final String title;
  final String value;
  final String? trendText;
  final Color? trendColor;
  final IconData? icon;
  final String? symbol;
  final Color? accent;

  const StatData({
    required this.title,
    required this.value,
    this.trendText,
    this.trendColor,
    this.icon,
    this.symbol,
    this.accent,
  });
}

class ProviderData {
  final String id;
  final String initials;
  final String name;
  final int reviewsCount;
  final double? rating;

  const ProviderData({required this.id, required this.initials, required this.name, required this.reviewsCount, this.rating});
}

class ActivityItem {
  final String message;
  final String timeAgo;
  final Color? color;
  final DateTime? timestamp;

  const ActivityItem({required this.message, required this.timeAgo, this.color, this.timestamp});
}

class StatCard extends StatelessWidget {
  final StatData data;

  const StatCard({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    final accent = data.accent ?? const Color(0xFFFF6B00);
    final showTrend =
        data.trendText != null && data.trendText!.trim().isNotEmpty;

    return Container(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE8ECF3)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(.05),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    data.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      height: 1.15,
                      color: Color(0xFF556070),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 6),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      data.value,
                      maxLines: 1,
                      style: const TextStyle(
                        fontSize: 30,
                        height: 1,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF071225),
                      ),
                    ),
                  ),
                  if (showTrend) ...[
                    const SizedBox(height: 6),
                    Text(
                      data.trendText!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: data.trendColor ?? const Color(0xFF00A651),
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        height: 1.1,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: accent.withOpacity(.10),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: data.symbol != null
                    ? Text(
                        data.symbol!,
                        style: TextStyle(
                          color: accent,
                          fontSize: 26,
                          fontWeight: FontWeight.w600,
                          height: 1,
                        ),
                      )
                    : Icon(
                        data.icon,
                        color: accent,
                        size: 24,
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class RevenueChartCard extends StatefulWidget {
  final String title;
  final String collection;
  final String sumField;

  const RevenueChartCard({super.key, required this.title, this.collection = 'payments', this.sumField = 'amount'});

  @override
  State<RevenueChartCard> createState() => _RevenueChartCardState();
}

enum RevenueRange { sevenDays, oneMonth, threeMonths, oneYear }

class _RevenueChartCardState extends State<RevenueChartCard> {
  RevenueRange _range = RevenueRange.sevenDays;

  DateTime _startForRange(RevenueRange r) {
    final now = DateTime.now();
    switch (r) {
      case RevenueRange.sevenDays:
        return DateTime(now.year, now.month, now.day).subtract(const Duration(days: 6));
      case RevenueRange.oneMonth:
        return DateTime(now.year, now.month, 1);
      case RevenueRange.threeMonths:
        return DateTime(
          now.year,
          now.month - 2,
          1,
        );
      case RevenueRange.oneYear:
        return DateTime(
          now.year,
          now.month - 11,
          1,
        );
    }
  }

  List<DateTime> _bucketsForRange(RevenueRange r) {
    final now = DateTime.now();

    switch (r) {
      // 7D
      case RevenueRange.sevenDays:
        return List.generate(
          7,
          (i) => DateTime(
            now.year,
            now.month,
            now.day,
          ).subtract(Duration(days: 6 - i)),
        );

      case RevenueRange.oneMonth:
        final firstDay = DateTime(now.year, now.month, 1);
        final lastDay = DateTime(now.year, now.month + 1, 0);

        final weekCount =
            ((lastDay.day - 1) ~/ 7) + 1;

        return List.generate(
          weekCount,
          (i) => firstDay.add(Duration(days: i * 7)),
        );

      case RevenueRange.threeMonths:
        // 3 monthly buckets
        return List.generate(
          3,
          (i) => DateTime(
            now.year,
            now.month - 2 + i,
            1,
          ),
        );

      case RevenueRange.oneYear:
        // 12 monthly buckets
        return List.generate(
          12,
          (i) => DateTime(now.year, now.month - 11 + i, 1),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final start = _startForRange(_range);
        return LayoutBuilder(
        builder: (context, constraints) {
        final maxW = constraints.maxWidth.isFinite ? constraints.maxWidth : 800.0;
        final chartHeight = maxW >= 900 ? 270.0 : 300.0;

        return SizedBox(
          height: chartHeight,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFE9EDF3))),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          widget.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 16),
                    Wrap(
                      spacing: 8,
                        children: [
                          _rangeChip(RevenueRange.sevenDays, '7D'),
                          const SizedBox(width: 6),
                          _rangeChip(RevenueRange.oneMonth, '1M'),
                          const SizedBox(width: 6),
                          _rangeChip(RevenueRange.threeMonths, '3M'),
                          const SizedBox(width: 6),
                          _rangeChip(RevenueRange.oneYear, '1Y'),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  Expanded(
                    child: StreamBuilder(
                      stream: FirebaseFirestore.instance.collection(widget.collection).where('createdAt', isGreaterThanOrEqualTo: start).snapshots(),
                      builder: (context, snap) {
                        if (snap.hasError) {
                          return Center(child: Text('Error', style: Theme.of(context).textTheme.bodySmall));
                        }
                        if (!snap.hasData) {
                          return const Center(child: CircularProgressIndicator());
                        }

                        final docs = snap.data!.docs;
                        final buckets = _bucketsForRange(_range);
                        final sums = List<double>.filled(buckets.length, 0.0);

                        for (final d in docs) {
                          final data = d.data() as Map<String, dynamic>;
                          DateTime? dt;
                          dt = dt ?? _extractDate(data['createdAt']);
                          dt = dt ?? _extractDate(data['timestamp']);
                          dt = dt ?? _extractDate(data['time']);
                          dt = dt ?? _extractDate(data['date']);
                          if (dt == null) continue;

                          double amount = 0.0;
                          if (data.containsKey(widget.sumField)) {
                            amount = (data[widget.sumField] is num)
                                ? (data[widget.sumField] as num).toDouble()
                                : double.tryParse('${data[widget.sumField]}') ?? 0.0;
                          }

                          for (var i = 0; i < buckets.length; i++) {
                            final b = buckets[i];
                            var matches = false;
                            switch (_range) {
                              case RevenueRange.sevenDays:
                                matches =
                                    dt.year == b.year &&
                                    dt.month == b.month &&
                                    dt.day == b.day;
                                break;

                              case RevenueRange.oneMonth:
                                final monthEnd = DateTime(b.year, b.month + 1, 1);

                                final end = b.add(const Duration(days: 7));

                                final bucketEnd =
                                    end.isBefore(monthEnd)
                                        ? end
                                        : monthEnd;

                                matches =
                                    !dt.isBefore(b) &&
                                    dt.isBefore(bucketEnd);
                                break;

                              case RevenueRange.threeMonths:
                                matches =
                                    dt.year == b.year &&
                                    dt.month == b.month;
                                break;

                              case RevenueRange.oneYear:
                                matches =
                                    dt.year == b.year &&
                                    dt.month == b.month;
                                break;
                            }

                            if (matches) {
                              sums[i] += amount;
                              break;
                            }
                          }
                        }

                        final maxSum = sums.isNotEmpty ? sums.reduce((a, b) => a > b ? a : b) : 0.0;
                        final total = sums.fold(0.0, (double acc, double amount) => acc + amount);

                        return Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Total: ₱${total.toStringAsFixed(2)}', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                              const SizedBox(height: 8),
                              Flexible(
                                child: RepaintBoundary(
                                  child: SizedBox(
                                    height: 120,
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: sums.asMap().entries.map((entry) {
                                        final idx = entry.key;
                                        final v = entry.value;

                                        final label = _bucketLabel(
                                          buckets[idx],
                                          _range,
                                        );

                                        final heightFactor = maxSum > 0 ? (v / maxSum) : 0.0;

                                        final barHeight = maxSum == 0
                                          ? 8.0
                                          : (heightFactor * 100).clamp(8.0, 100.0);

                                        return Expanded(
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(horizontal: 4),
                                            child: Column(
                                              mainAxisAlignment: MainAxisAlignment.end,
                                              children: [
                                                Tooltip(
                                                  message: '₱${v.toStringAsFixed(2)}',
                                                  child: Align(
                                                    alignment: Alignment.bottomCenter,
                                                    child: Container(
                                                      width: 20,
                                                      height: barHeight,
                                                      decoration: BoxDecoration(
                                                        color: const Color(0xFF3B82F6),
                                                        borderRadius: BorderRadius.circular(6),
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                                const SizedBox(height: 8),
                                                Text(
                                                  label,
                                                  textAlign: TextAlign.center,
                                                ),
                                              ],
                                            ),
                                          ),
                                        );
                                      }).toList(),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );
    }

  String _bucketLabel(DateTime dt, RevenueRange r) {
    switch (r) {
      case RevenueRange.sevenDays:
        const days = [
          'Mon',
          'Tue',
          'Wed',
          'Thu',
          'Fri',
          'Sat',
          'Sun',
        ];
        return days[dt.weekday - 1];

      case RevenueRange.oneMonth:
        final firstDay = DateTime(dt.year, dt.month, 1);
        final week = ((dt.difference(firstDay).inDays) ~/ 7) + 1;
        return 'Week $week';

      case RevenueRange.threeMonths:
        const months = [
          '',
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        return months[dt.month];

      case RevenueRange.oneYear:
        const months = [
          '',
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        return months[dt.month];
    }
  }

  String _rangeLabel(RevenueRange r) {
    switch (r) {
      case RevenueRange.sevenDays:
        return '7D';
      case RevenueRange.oneMonth:
        return '1M';
      case RevenueRange.threeMonths:
        return '3M';
      case RevenueRange.oneYear:
        return '1Y';
    }
  }

  Widget _rangeChip(RevenueRange r, String label) {
    final selected = _range == r;
    return GestureDetector(
      onTap: () => setState(() => _range = r),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(color: selected ? const Color(0xFF3B82F6) : const Color(0xFFF3F4F6), borderRadius: BorderRadius.circular(8)),
        child: Text(label, style: TextStyle(color: selected ? Colors.white : const Color(0xFF374151), fontWeight: FontWeight.w600)),
      ),
    );
  }
}

class TopProvidersCard extends StatelessWidget {
  final List<ProviderData> providers;
  final String title;

  const TopProvidersCard({super.key, required this.providers, required this.title});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFE9EDF3))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          if (providers.isNotEmpty)
            Column(children: providers.map((p) => _ProviderRow(data: p)).toList())
          else
            // load from Firestore and compute average rating + review count
            StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance.collection('providers').snapshots(),
              builder: (context, snap) {
                if (snap.hasError) {
                  return Padding(padding: const EdgeInsets.symmetric(vertical: 20), child: Center(child: Text('Error loading providers', style: Theme.of(context).textTheme.bodySmall)));
                }
                if (!snap.hasData) {
                  return Padding(padding: const EdgeInsets.symmetric(vertical: 20), child: Center(child: Text('Loading providers...', style: Theme.of(context).textTheme.bodySmall)));
                }

                final docs = snap.data!.docs;

                return FutureBuilder<List<ProviderData>>(
                  future: Future.wait(docs.map((d) async {
                    final data = d.data() as Map<String, dynamic>?;
                    final id = d.id;
                    final name = (data?['name'] ?? data?['businessName'] ?? data?['displayName'] ?? '').toString();
                    final initials = name.isNotEmpty ? name.split(' ').map((s) => s.isNotEmpty ? s[0] : '').take(2).join().toUpperCase() : id.substring(0, 2).toUpperCase();

                    final reviewsSnap = await FirebaseFirestore.instance.collection('reviews').where('providerId', isEqualTo: id).get();
                    final int count = reviewsSnap.docs.length;
                    double avg = 0.0;
                    if (count > 0) {
                      double sum = 0.0;
                      for (final r in reviewsSnap.docs) {
                        final rv = r.data() as Map<String, dynamic>?;
                        final ratingVal = rv?['rating'];
                        if (ratingVal is num) {
                          sum += ratingVal.toDouble();
                        } else if (ratingVal is String) {
                          sum += double.tryParse(ratingVal) ?? 0.0;
                        }
                      }
                      avg = sum / count;
                    }

                    return ProviderData(id: id, initials: initials, name: name.isNotEmpty ? name : 'Unknown', reviewsCount: count, rating: avg);
                  }).toList()),
                  builder: (context, future) {
                    if (future.connectionState != ConnectionState.done) {
                      return Padding(padding: const EdgeInsets.symmetric(vertical: 20), child: Center(child: Text('Computing ratings...', style: Theme.of(context).textTheme.bodySmall)));
                    }
                    final list = future.data ?? [];
                    list.sort((a, b) {
                      final ar = a.rating ?? 0.0;
                      final br = b.rating ?? 0.0;
                      if (br.compareTo(ar) != 0) return br.compareTo(ar);
                      return b.reviewsCount.compareTo(a.reviewsCount);
                    });

                    if (list.isEmpty) return Padding(padding: const EdgeInsets.symmetric(vertical: 20), child: Center(child: Text('No providers', style: Theme.of(context).textTheme.bodySmall)));

                    final top = list.take(6).toList();
                    return Column(children: top.map((p) => _ProviderRow(data: p)).toList());
                  },
                );
              },
            ),
        ],
      ),
    );
  }
}

class _ProviderRow extends StatelessWidget {
  final ProviderData data;
  const _ProviderRow({required this.data});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          CircleAvatar(radius: 18, backgroundColor: const Color(0xFFFF6B00), child: Text(data.initials, style: const TextStyle(color: Colors.white))),
          const SizedBox(width: 12),
          Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(data.name, style: Theme.of(context).textTheme.bodyMedium),
            Text('${data.reviewsCount} reviews', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: const Color(0xFF9CA3AF)))
          ])),
          Text(data.rating != null ? data.rating!.toStringAsFixed(1) : '-', style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class QuickActionsCard extends StatelessWidget {
  final List<String> actions;
  final String title;
  final void Function(String route)? onNavigate;

  const QuickActionsCard({super.key, required this.actions, required this.title, this.onNavigate});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFE9EDF3))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
          Column(children: [
            // Pending verifications badge
            StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance.collection('providerVerifications').where('status', isEqualTo: 'pending').snapshots(),
              builder: (context, snap) {
                final count = snap.hasData ? snap.data!.docs.length : 0;
                return _ActionRow(label: 'Pending verifications', badgeCount: count, onTap: () => onNavigate != null ? onNavigate!('provider_verifications') : Navigator.pushNamed(context, 'provider_verifications'));
              },
            ),
            // Pending complaints badge
            StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance.collection('complaints').where('status', isEqualTo: 'pending').snapshots(),
              builder: (context, snap) {
                final count = snap.hasData ? snap.data!.docs.length : 0;
                return _ActionRow(label: 'Pending complaints', badgeCount: count, onTap: () => onNavigate != null ? onNavigate!('complaints') : Navigator.pushNamed(context, 'complaints'));
              },
            ),
            const SizedBox(height: 8),
            ...actions.map((a) => _ActionRow(label: a))
          ])
      ]),
    );
  }
}

class _ActionRow extends StatelessWidget {
  final String label;
  final int? badgeCount;
  final VoidCallback? onTap;
  const _ActionRow({required this.label, this.badgeCount, this.onTap});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: InkWell(
        onTap: onTap,
        child: Row(
          children: [
            Expanded(child: Text(label, style: Theme.of(context).textTheme.bodyMedium)),
            if (badgeCount != null && badgeCount! > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(999)),
                child: Text(badgeCount!.toString(), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: const Color(0xFFB91C1C), fontWeight: FontWeight.w700)),
              ),
            const Icon(Icons.chevron_right_rounded, color: Color(0xFF9CA3AF)),
          ],
        ),
      ),
    );
  }
}

class RecentActivitiesCard extends StatelessWidget {
  final List<ActivityItem> activities;
  final String title;

  const RecentActivitiesCard({
    super.key,
    required this.activities,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    Widget buildCard(Widget child) {
      return Container(
        padding: const EdgeInsets.fromLTRB(24, 22, 24, 18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE9EDF3)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: child,
      );
    }

    final header = Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF0F172A),
                ),
          ),
        ),
        InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () {
            try {
              Navigator.pushNamed(context, 'admin_logs');
            } catch (_) {}
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(
              children: [
                Text(
                  'View All',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF334155),
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  Icons.arrow_forward_rounded,
                  size: 18,
                  color: Color(0xFF334155),
                ),
              ],
            ),
          ),
        ),
      ],
    );

    if (activities.isNotEmpty) {
      return buildCard(
        Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            header,
            const SizedBox(height: 18),
            ...activities.take(5).map((a) => _ActivityRow(activity: a)),
          ],
        ),
      );
    }

    return buildCard(
      Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          header,
          const SizedBox(height: 18),
          FutureBuilder<List<ActivityItem>>(
            future: () async {
              final logsSnap = await FirebaseFirestore.instance
                  .collection('adminLogs')
                  .orderBy('createdAt', descending: true)
                  .limit(10)
                  .get();

              final noteSnap = await FirebaseFirestore.instance
                  .collection('notifications')
                  .orderBy('createdAt', descending: true)
                  .limit(10)
                  .get();

              final items = <ActivityItem>[];

              for (final d in logsSnap.docs) {
                final data = d.data();
                final ts = _extractDate(data['createdAt']) ?? DateTime.now();

                items.add(
                  ActivityItem(
                    message: (data['message'] ??
                            data['action'] ??
                            data['detail'] ??
                            'Log entry')
                        .toString(),
                    timeAgo: _timeAgo(ts),
                    timestamp: ts,
                    color: const Color(0xFF3B82F6),
                  ),
                );
              }

              for (final d in noteSnap.docs) {
                final data = d.data();
                final ts = _extractDate(data['createdAt']) ?? DateTime.now();

                items.add(
                  ActivityItem(
                    message:
                        (data['title'] ?? data['body'] ?? 'Notification')
                            .toString(),
                    timeAgo: _timeAgo(ts),
                    timestamp: ts,
                    color: const Color(0xFFF59E0B),
                  ),
                );
              }

              items.sort(
                (a, b) => (b.timestamp ?? DateTime.now()).compareTo(
                  a.timestamp ?? DateTime.now(),
                ),
              );

              return items.take(5).toList();
            }(),
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 32),
                  child: Center(child: CircularProgressIndicator()),
                );
              }

              final list = snap.data ?? [];

              if (list.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 32),
                  child: Text(
                    'No recent activities',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: const Color(0xFF94A3B8),
                        ),
                  ),
                );
              }

              return Column(
                children: list.map((a) => _ActivityRow(activity: a)).toList(),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final ActivityItem activity;

  const _ActivityRow({required this.activity});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 13),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Color(0xFFF1F5F9)),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(
              color: activity.color ?? const Color(0xFF3B82F6),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              activity.message,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF1E293B),
                    fontWeight: FontWeight.w500,
                  ),
            ),
          ),
          const SizedBox(width: 16),
          Text(
            activity.timeAgo,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF94A3B8),
                  fontWeight: FontWeight.w500,
                ),
          ),
        ],
      ),
    );
  }
}

class PlatformHealthCard extends StatelessWidget {
  final Map<String, String> metrics;
  final String title;

  const PlatformHealthCard({super.key, required this.metrics, required this.title});

  @override
  Widget build(BuildContext context) {
    if (metrics.isNotEmpty) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFE9EDF3))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Column(
            children: metrics.entries
              .map((e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [Text(e.key, style: Theme.of(context).textTheme.bodySmall), const Spacer(), Flexible(child: Text(e.value, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700), textAlign: TextAlign.right, overflow: TextOverflow.ellipsis))])))
              .toList())
        ]),
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFE9EDF3))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        FutureBuilder<Map<String, String>>(
          future: _gatherPlatformHealth(),
          builder: (context, snap) {
            if (snap.hasError) return Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text('Error checking platform health', style: Theme.of(context).textTheme.bodySmall));
            if (!snap.hasData) return Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Center(child: Text('Checking...', style: Theme.of(context).textTheme.bodySmall)));
            
            final map = snap.data!;

            return Column(
            children: map.entries.map((e) {
                return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                    children: [
                    Text(
                        e.key,
                        style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const Spacer(),
                    Flexible(
                        child: Text(
                        e.value,
                        style: Theme.of(context)
                            .textTheme
                            .bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                        textAlign: TextAlign.right,
                        overflow: TextOverflow.ellipsis,
                        ),
                    ),
                    ],
                ),
                );
            }).toList(),
            );
          },
        )
      ]),
    );
  }
}

Future<Map<String, String>> _gatherPlatformHealth() async {
  final Map<String, String> out = {};

  // Firestore connectivity + latency
  try {
    final sw = Stopwatch()..start();
    final doc = await FirebaseFirestore.instance.collection('_healthcheck').doc('ping').get();
    sw.stop();
    out['Firestore'] = doc.exists ? 'OK (${sw.elapsedMilliseconds} ms)' : 'OK (${sw.elapsedMilliseconds} ms) — doc missing';
  } catch (e) {
    out['Firestore'] = 'Error: ${e.toString()}';
  }

  // Authentication status
  try {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      out['Authentication'] = 'Signed out';
    } else {
      final sw = Stopwatch()..start();
      await user.reload();
      sw.stop();
      out['Authentication'] = 'Signed in as ${user.email ?? user.uid} (${sw.elapsedMilliseconds} ms)';
    }
  } catch (e) {
    out['Authentication'] = 'Error: ${e.toString()}';
  }

  // Cloud Function / response time (optional)
  try {
    final sw = Stopwatch()..start();
    final callable = FirebaseFunctions.instance.httpsCallable('healthPing');
    final resp = await callable.call();
    sw.stop();
    out['Function (healthPing)'] = 'OK (${sw.elapsedMilliseconds} ms)';
    if (resp.data != null) out['Function (healthPing)'] = '${out['Function (healthPing)']} — ${resp.data}';
  } catch (e) {
    out['Function (healthPing)'] = 'Unavailable';
  }

  return out;
}

class FirestoreStatCard extends StatelessWidget {
  final String title;
  final IconData? icon;
  final Color? accent;
  final String collection;
  final String? sumField;
  final String? filterKey;
  final dynamic filterValue;
  final String? symbol;

  const FirestoreStatCard({
    super.key,
    required this.title,
    this.icon,
    this.symbol,
    this.accent,
    required this.collection,
    this.sumField,
    this.filterKey,
    this.filterValue,
  });

  double _numFrom(dynamic v) {
    if (v == null) return 0.0;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? 0.0;
    return 0.0;
  }

  DateTime? _dateFrom(dynamic raw) {
    if (raw == null) return null;
    if (raw is Timestamp) return raw.toDate();
    if (raw is DateTime) return raw;
    if (raw is int) return DateTime.fromMillisecondsSinceEpoch(raw);
    if (raw is String) return DateTime.tryParse(raw);
    return null;
  }

  String _formatMoney(double value) {
    if (value >= 1000000) {
      return '₱${(value / 1000000).toStringAsFixed(1)}M';
    }
    if (value >= 1000) {
      return '₱${(value / 1000).toStringAsFixed(1)}K';
    }
    return '₱${value.toStringAsFixed(0)}';
  }

  String _formatNumber(int value) {
    return value.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );
  }

  bool _passesFilter(Map<String, dynamic> data) {
    if (filterKey == null) return true;
    return data[filterKey] == filterValue;
  }

  double _valueOfDoc(Map<String, dynamic> data) {
    if (sumField != null) {
      return _numFrom(data[sumField]) +
          (data.containsKey(sumField) ? 0 : _numFrom(data['amount']));
    }

    return 1;
  }

  @override
  Widget build(BuildContext context) {
    final accentColor = accent ?? const Color(0xFFFF6B00);

    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance.collection(collection).snapshots(),
      builder: (context, snapshot) {
        String valueText = '—';
        String? trendText;
        Color? trendColor;

        if (snapshot.hasError) {
          valueText = 'Error';
        } else if (!snapshot.hasData) {
          valueText = 'Loading...';
        } else {
          final now = DateTime.now();
          final currentMonthStart = DateTime(now.year, now.month, 1);
          final previousMonthStart = DateTime(now.year, now.month - 1, 1);

          double totalValue = 0;
          double currentMonthValue = 0;
          double previousMonthValue = 0;

          for (final doc in snapshot.data!.docs) {
            final data = doc.data() as Map<String, dynamic>;

            if (!_passesFilter(data)) continue;

            final docValue = _valueOfDoc(data);
            totalValue += docValue;

            final createdAt = _dateFrom(data['createdAt']) ??
                _dateFrom(data['timestamp']) ??
                _dateFrom(data['date']);

            if (createdAt != null) {
              if (!createdAt.isBefore(currentMonthStart)) {
                currentMonthValue += docValue;
              } else if (!createdAt.isBefore(previousMonthStart) &&
                  createdAt.isBefore(currentMonthStart)) {
                previousMonthValue += docValue;
              }
            }
          }

          if (sumField != null) {
            valueText = _formatMoney(totalValue);
          } else {
            valueText = _formatNumber(totalValue.toInt());
          }

          if (filterKey == 'status' && filterValue == 'pending') {
            if (totalValue > 0) {
              trendText = 'Needs attention';
              trendColor = const Color(0xFFF59E0B);
            }
          } else if (currentMonthValue > 0) {
            if (previousMonthValue > 0) {
              final percent =
                  ((currentMonthValue - previousMonthValue) / previousMonthValue) * 100;

              if (percent > 0) {
                trendText = '↑ ${percent.toStringAsFixed(0)}% this month';
                trendColor = const Color(0xFF00A651);
              } else if (percent < 0) {
                trendText = '↓ ${percent.abs().toStringAsFixed(0)}% this month';
                trendColor = const Color(0xFFDC2626);
              }
            } else {
              trendText = '↑ ${currentMonthValue.toInt()} this month';
              trendColor = const Color(0xFF00A651);
            }
          }
        }

        return StatCard(
          data: StatData(
            title: title,
            value: valueText,
            trendText: trendText,
            trendColor: trendColor,
            icon: icon,
            symbol: symbol,
            accent: accentColor,
          ),
        );
      },
    );
  }
}