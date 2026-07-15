import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';

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

enum RevenueRange {
  sevenDays,
  oneMonth,
  threeMonths,
  oneYear,
}

class RevenueChartCard extends StatefulWidget {
  final String title;
  final String collection;
  final String sumField;

  const RevenueChartCard({
    super.key,
    required this.title,
    this.collection = 'payments',
    this.sumField = 'amount',
  });

  @override
  State<RevenueChartCard> createState() => _RevenueChartCardState();
}

class _RevenueChartCardState extends State<RevenueChartCard> {
  RevenueRange _selectedRange = RevenueRange.oneMonth;

  static const Color _primaryColor = Color(0xFFFF6333);

  DateTime get _now => DateTime.now();

  DateTime _startForRange(RevenueRange range) {
    final now = _now;

    switch (range) {
      case RevenueRange.sevenDays:
        return DateTime(now.year, now.month, now.day)
            .subtract(const Duration(days: 6));

      case RevenueRange.oneMonth:
        return DateTime(now.year, now.month, 1);

      case RevenueRange.threeMonths:
        return DateTime(now.year, now.month - 2, 1);

      case RevenueRange.oneYear:
        return DateTime(now.year, now.month - 11, 1);
    }
  }

  List<DateTime> _bucketsForRange(RevenueRange range) {
    final now = _now;

    switch (range) {
      case RevenueRange.sevenDays:
        return List.generate(
          7,
          (index) {
            return DateTime(now.year, now.month, now.day)
                .subtract(Duration(days: 6 - index));
          },
        );

      case RevenueRange.oneMonth:
        final firstDay = DateTime(now.year, now.month, 1);
        final totalDays = DateTime(now.year, now.month + 1, 0).day;

        return List.generate(
          totalDays,
          (index) => firstDay.add(Duration(days: index)),
        );

      case RevenueRange.threeMonths:
        return List.generate(
          3,
          (index) => DateTime(
            now.year,
            now.month - 2 + index,
            1,
          ),
        );

      case RevenueRange.oneYear:
        return List.generate(
          12,
          (index) => DateTime(
            now.year,
            now.month - 11 + index,
            1,
          ),
        );
    }
  }

  DateTime? _extractPaymentDate(Map<String, dynamic> data) {
    return _extractDate(data['paidAt']);
  }

  double _extractAmount(Map<String, dynamic> data) {
    final rawAmount = data[widget.sumField] ?? data['amount'];

    if (rawAmount is num) {
      return rawAmount.toDouble();
    }

    if (rawAmount is String) {
      return double.tryParse(rawAmount) ?? 0;
    }

    return 0;
  }

  bool _isSuccessfulPayment(Map<String, dynamic> data) {
    final status = data['status']
        ?.toString()
        .trim()
        .toLowerCase();

    return status == 'paid' ||
        status == 'completed' ||
        status == 'successful' ||
        status == 'success';
  }

  bool _dateMatchesBucket(
    DateTime paymentDate,
    DateTime bucket,
    RevenueRange range,
  ) {
    switch (range) {
      case RevenueRange.sevenDays:
      case RevenueRange.oneMonth:
        return paymentDate.year == bucket.year &&
            paymentDate.month == bucket.month &&
            paymentDate.day == bucket.day;

      case RevenueRange.threeMonths:
      case RevenueRange.oneYear:
        return paymentDate.year == bucket.year &&
            paymentDate.month == bucket.month;
    }
  }

  List<double> _calculateRevenue(
    List<QueryDocumentSnapshot> documents,
    List<DateTime> buckets,
  ) {
    final values = List<double>.filled(buckets.length, 0);

    for (final document in documents) {
      final data = document.data() as Map<String, dynamic>;

      if (!_isSuccessfulPayment(data)) {
        continue;
      }

      final paymentDate = _extractPaymentDate(data);

      if (paymentDate == null) {
        continue;
      }

      final amount = _extractAmount(data);

      if (amount <= 0) {
        continue;
      }

      for (var index = 0; index < buckets.length; index++) {
        if (_dateMatchesBucket(
          paymentDate,
          buckets[index],
          _selectedRange,
        )) {
          values[index] += amount;
          break;
        }
      }
    }

    return values;
  }

  double _calculateYAxisMaximum(List<double> values) {
    if (values.isEmpty) return 1000;

    final highestValue = values.reduce(math.max);

    if (highestValue <= 0) return 1000;

    final paddedValue = highestValue * 1.20;
    final roughInterval = paddedValue / 4;
    final interval = _niceNumber(roughInterval);

    return interval * 4;
  }

  double _niceNumber(double value) {
    if (value <= 0) return 250;

    final exponent = math.pow(
      10,
      (math.log(value) / math.ln10).floor(),
    ).toDouble();

    final fraction = value / exponent;

    double niceFraction;

    if (fraction <= 1) {
      niceFraction = 1;
    } else if (fraction <= 2) {
      niceFraction = 2;
    } else if (fraction <= 2.5) {
      niceFraction = 2.5;
    } else if (fraction <= 5) {
      niceFraction = 5;
    } else {
      niceFraction = 10;
    }

    return niceFraction * exponent;
  }

  String _formatCurrency(double value) {
    if (value == 0) return '₱0';

    if (value >= 1000000) {
      final millions = value / 1000000;

      return millions % 1 == 0
          ? '₱${millions.toStringAsFixed(0)}M'
          : '₱${millions.toStringAsFixed(1)}M';
    }

    if (value >= 1000) {
      final thousands = value / 1000;

      return thousands % 1 == 0
          ? '₱${thousands.toStringAsFixed(0)}K'
          : '₱${thousands.toStringAsFixed(1)}K';
    }

    return '₱${value.toStringAsFixed(0)}';
  }

  String _formatTooltipCurrency(double value) {
    return '₱${value.toStringAsFixed(2).replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (match) => ',',
    )}';
  }

  String _bottomLabel(
    int index,
    List<DateTime> buckets,
  ) {
    if (index < 0 || index >= buckets.length) {
      return '';
    }

    final date = buckets[index];

    switch (_selectedRange) {
      case RevenueRange.sevenDays:
        const weekdayLabels = [
          'Mon',
          'Tue',
          'Wed',
          'Thu',
          'Fri',
          'Sat',
          'Sun',
        ];

        return weekdayLabels[date.weekday - 1];

      case RevenueRange.oneMonth:
        // Avoid showing all 28–31 day labels.
        final visibleIndexes = <int>{
          0,
          (buckets.length * 0.25).floor(),
          (buckets.length * 0.50).floor(),
          (buckets.length * 0.75).floor(),
          buckets.length - 1,
        };

        if (!visibleIndexes.contains(index)) {
          return '';
        }

        return '${date.day}';

      case RevenueRange.threeMonths:
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

        return months[date.month];
    }
  }

  String _tooltipDate(DateTime date) {
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

    switch (_selectedRange) {
      case RevenueRange.sevenDays:
      case RevenueRange.oneMonth:
        return '${months[date.month]} ${date.day}, ${date.year}';

      case RevenueRange.threeMonths:
      case RevenueRange.oneYear:
        return '${months[date.month]} ${date.year}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final startDate = _startForRange(_selectedRange);

    return Container(
      constraints: const BoxConstraints(
        minHeight: 340,
      ),
      padding: const EdgeInsets.fromLTRB(24, 22, 24, 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFE6EAF0),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.045),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ChartHeader(
            title: widget.title,
            selectedRange: _selectedRange,
            onRangeChanged: (range) {
              if (_selectedRange == range) {
                return;
              }

              setState(() {
                _selectedRange = range;
              });
            },
          ),
          const SizedBox(height: 20),
          StreamBuilder<QuerySnapshot>(
            stream: FirebaseFirestore.instance
              .collection(widget.collection)
              .where(
                'paidAt',
                isGreaterThanOrEqualTo: Timestamp.fromDate(startDate),
              )
              .snapshots(),
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return const SizedBox(
                  height: 250,
                  child: _RevenueChartMessage(
                    icon: Icons.error_outline_rounded,
                    title: 'Unable to load revenue',
                    message:
                        'Revenue data could not be retrieved. Please try again.',
                  ),
                );
              }

              if (snapshot.connectionState == ConnectionState.waiting) {
                return const SizedBox(
                  height: 250,
                  child: Center(
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: _primaryColor,
                    ),
                  ),
                );
              }

              final buckets = _bucketsForRange(_selectedRange);
              final values = _calculateRevenue(
                snapshot.data?.docs ?? [],
                buckets,
              );

              return _RevenueLineChart(
                buckets: buckets,
                values: values,
                selectedRange: _selectedRange,
                maximumY: _calculateYAxisMaximum(values),
                bottomLabel: (index) => _bottomLabel(index, buckets),
                tooltipDate: _tooltipDate,
                formatCurrency: _formatCurrency,
                formatTooltipCurrency: _formatTooltipCurrency,
                bottomTitleInterval: 1,
              );
            },
          ),
        ],
      ),
    );
  }
}


class _ChartHeader extends StatelessWidget {
  final String title;
  final RevenueRange selectedRange;
  final ValueChanged<RevenueRange> onRangeChanged;

  const _ChartHeader({
    required this.title,
    required this.selectedRange,
    required this.onRangeChanged,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final rangeButtons = Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            _RevenueRangeButton(
              label: '7D',
              selected: selectedRange == RevenueRange.sevenDays,
              onTap: () => onRangeChanged(RevenueRange.sevenDays),
            ),
            _RevenueRangeButton(
              label: '1M',
              selected: selectedRange == RevenueRange.oneMonth,
              onTap: () => onRangeChanged(RevenueRange.oneMonth),
            ),
            _RevenueRangeButton(
              label: '3M',
              selected: selectedRange == RevenueRange.threeMonths,
              onTap: () => onRangeChanged(RevenueRange.threeMonths),
            ),
            _RevenueRangeButton(
              label: '1Y',
              selected: selectedRange == RevenueRange.oneYear,
              onTap: () => onRangeChanged(RevenueRange.oneYear),
            ),
          ],
        );

        if (constraints.maxWidth < 520) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: const Color(0xFF0F172A),
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 14),
              rangeButtons,
            ],
          );
        }

        return Row(
          children: [
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: const Color(0xFF0F172A),
                      fontWeight: FontWeight.w800,
                    ),
              ),
            ),
            const SizedBox(width: 20),
            rangeButtons,
          ],
        );
      },
    );
  }
}

class _RevenueRangeButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _RevenueRangeButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? const Color(0xFFFF6333)
          : Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(
            horizontal: 13,
            vertical: 8,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              color: selected
                  ? Colors.white
                  : const Color(0xFF98A2B3),
              fontWeight: selected
                  ? FontWeight.w700
                  : FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _RevenueLineChart extends StatelessWidget {
  final List<DateTime> buckets;
  final List<double> values;
  final RevenueRange selectedRange;
  final double maximumY;
  final String Function(int index) bottomLabel;
  final String Function(DateTime date) tooltipDate;
  final String Function(double value) formatCurrency;
  final String Function(double value) formatTooltipCurrency;
  final double bottomTitleInterval;

  const _RevenueLineChart({
    required this.buckets,
    required this.values,
    required this.selectedRange,
    required this.maximumY,
    required this.bottomLabel,
    required this.tooltipDate,
    required this.formatCurrency,
    required this.formatTooltipCurrency,
    required this.bottomTitleInterval,
  });

  @override
  Widget build(BuildContext context) {
    final spots = List.generate(
      values.length,
      (index) => FlSpot(
        index.toDouble(),
        values[index],
      ),
    );
    

    final horizontalInterval = maximumY / 4;

    return SizedBox(
      height: 250,
      child: LineChart(
        LineChartData(
          minX: 0,
          maxX: math.max(0, values.length - 1).toDouble(),
          minY: 0,
          maxY: maximumY,
          clipData: const FlClipData.all(),
          borderData: FlBorderData(
            show: false,
          ),
          gridData: FlGridData(
            show: true,
            drawVerticalLine: true,
            horizontalInterval: horizontalInterval,
            verticalInterval: _verticalGridInterval(),
            getDrawingHorizontalLine: (_) {
              return const FlLine(
                color: Color(0xFFEFF2F6),
                strokeWidth: 1,
                dashArray: [4, 4],
              );
            },
            getDrawingVerticalLine: (_) {
              return const FlLine(
                color: Color(0xFFF3F5F8),
                strokeWidth: 1,
                dashArray: [4, 4],
              );
            },
          ),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            rightTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 62,
                interval: horizontalInterval,
                getTitlesWidget: (value, meta) {
                  return SideTitleWidget(
                    meta: meta,
                    space: 10,
                    child: Text(
                      formatCurrency(value),
                      style: const TextStyle(
                        color: Color(0xFF98A2B3),
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  );
                },
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 34,
                interval: bottomTitleInterval,
                getTitlesWidget: (value, meta) {
                  final index = value.round();

                  if (value != index.toDouble()) {
                    return const SizedBox.shrink();
                  }

                  final label = bottomLabel(index);

                  if (label.isEmpty) {
                    return const SizedBox.shrink();
                  }

                  return SideTitleWidget(
                    meta: meta,
                    space: 10,
                    child: Text(
                      label,
                      style: const TextStyle(
                        color: Color(0xFF98A2B3),
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          lineTouchData: LineTouchData(
            enabled: true,
            handleBuiltInTouches: true,
            touchTooltipData: LineTouchTooltipData(
              getTooltipColor: (_) => const Color(0xFF111827),
              tooltipBorderRadius: BorderRadius.circular(10),
              tooltipPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 10,
              ),
              tooltipMargin: 14,
              getTooltipItems: (touchedSpots) {
                return touchedSpots.map((spot) {
                  final index = spot.x.round();

                  if (index < 0 || index >= buckets.length) {
                    return null;
                  }

                  return LineTooltipItem(
                    '${tooltipDate(buckets[index])}\n',
                    const TextStyle(
                      color: Color(0xFFCBD5E1),
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                    children: [
                      TextSpan(
                        text: formatTooltipCurrency(spot.y),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  );
                }).toList();
              },
            ),
            getTouchedSpotIndicator: (barData, spotIndexes) {
              return spotIndexes.map((index) {
                return TouchedSpotIndicatorData(
                  const FlLine(
                    color: Color(0x66FF6333),
                    strokeWidth: 1,
                    dashArray: [4, 4],
                  ),
                  FlDotData(
                    show: true,
                    getDotPainter: (
                      spot,
                      percent,
                      barData,
                      index,
                    ) {
                      return FlDotCirclePainter(
                        radius: 5,
                        color: const Color(0xFFFF6333),
                        strokeWidth: 3,
                        strokeColor: Colors.white,
                      );
                    },
                  ),
                );
              }).toList();
            },
          ),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              curveSmoothness: 0.25,
              preventCurveOverShooting: true,
              color: const Color(0xFF111827),
              barWidth: 2.5,
              isStrokeCapRound: true,
              dotData: const FlDotData(
                show: false,
              ),
              belowBarData: BarAreaData(
                show: true,
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    const Color(0xFF111827).withOpacity(0.10),
                    const Color(0xFF111827).withOpacity(0.015),
                  ],
                ),
              ),
            ),
          ],
        ),
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeOutCubic,
      ),
    );
  }

  double _verticalGridInterval() {
    switch (selectedRange) {
      case RevenueRange.sevenDays:
        return 1;

      case RevenueRange.oneMonth:
        return 7;

      case RevenueRange.threeMonths:
      case RevenueRange.oneYear:
        return 1;
    }
  }
}

class _RevenueChartMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;

  const _RevenueChartMessage({
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 28,
            color: const Color(0xFF98A2B3),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: const Color(0xFF344054),
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF98A2B3),
                ),
          ),
        ],
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