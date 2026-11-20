import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/provider_calendar_month.dart';

typedef CalendarMonthLoader =
    Future<ProviderCalendarMonth> Function(String providerId, String month);

/// Uses the same month callable as Web. A successful month is advisory only;
/// the complete event must still pass checkCustomerProviderAvailability.
class ProviderCalendar extends StatefulWidget {
  const ProviderCalendar({
    super.key,
    required this.providerId,
    required this.loadMonth,
    this.selectedDate,
    this.today,
    this.planningOnly = false,
  });

  final String providerId;
  final CalendarMonthLoader loadMonth;
  final DateTime? selectedDate;
  final DateTime? today;
  final bool planningOnly;

  @override
  State<ProviderCalendar> createState() => _ProviderCalendarState();
}

class _ProviderCalendarState extends State<ProviderCalendar> {
  late DateTime month;
  DateTime? selected;
  ProviderCalendarMonth? data;
  bool failed = false;
  int generation = 0;
  Timer? refresh;
  DateTime get today => widget.today ?? manilaToday();
  DateTime get firstMonth => DateTime(today.year, today.month);
  DateTime get lastMonth => DateTime(today.year, today.month + 24);
  String get monthKey => calendarDateKey(month).substring(0, 7);

  @override
  void initState() {
    super.initState();
    _reset();
    refresh = Timer.periodic(const Duration(minutes: 1), (_) {
      setState(_load);
    });
  }

  void _reset() {
    selected = widget.selectedDate;
    final requested = selected ?? today;
    month = DateTime(requested.year, requested.month);
    if (month.isBefore(firstMonth) || month.isAfter(lastMonth)) {
      month = firstMonth;
    }
    _load();
  }

  @override
  void didUpdateWidget(covariant ProviderCalendar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.providerId != widget.providerId ||
        oldWidget.planningOnly != widget.planningOnly) {
      _reset();
    }
  }

  void _load() {
    final request = ++generation;
    final key = monthKey;
    data = null;
    failed = false;
    if (widget.planningOnly) return;
    Future.sync(() => widget.loadMonth(widget.providerId, key)).then(
      (value) {
        if (!mounted || request != generation) return;
        setState(() {
          if (value.month == key) {
            data = value;
          } else {
            failed = true;
          }
        });
      },
      onError: (Object _) {
        if (mounted && request == generation) setState(() => failed = true);
      },
    );
  }

  @override
  void dispose() {
    generation++;
    refresh?.cancel();
    super.dispose();
  }

  CalendarAvailability status(DateTime date) {
    if (calendarDateKey(date).compareTo(calendarDateKey(today)) <= 0) {
      return CalendarAvailability.unavailable;
    }
    return data?.status(date, today: today) ?? CalendarAvailability.unknown;
  }

  bool selectable(DateTime date) =>
      status(date) == CalendarAvailability.available ||
      widget.planningOnly &&
          calendarDateKey(date).compareTo(calendarDateKey(today)) > 0;

  Color color(CalendarAvailability state) => switch (state) {
    CalendarAvailability.available => AppColors.success,
    CalendarAvailability.booked => AppColors.error,
    CalendarAvailability.onHold => AppColors.warningBorder,
    CalendarAvailability.unavailable => AppColors.mainText,
    CalendarAvailability.unknown => AppColors.placeholder,
  };

  Widget dot(CalendarAvailability state) => Container(
    width: 6,
    height: 6,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: state == CalendarAvailability.unknown ? null : color(state),
      border: Border.all(color: color(state)),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final days = DateTime(month.year, month.month + 1, 0).day;
    final offset = month.weekday % 7;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(12),
        child: DefaultTextStyle(
          style: AppTypography.bodySmall,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  IconButton(
                    tooltip: 'Previous month',
                    onPressed: month.isAfter(firstMonth)
                        ? () => setState(() {
                            month = DateTime(month.year, month.month - 1);
                            _load();
                          })
                        : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Expanded(
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        localizations.formatMonthYear(month),
                        textAlign: TextAlign.center,
                        style: AppTypography.bodySmall.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Next month',
                    onPressed: month.isBefore(lastMonth)
                        ? () => setState(() {
                            month = DateTime(month.year, month.month + 1);
                            _load();
                          })
                        : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                  IconButton(
                    tooltip: 'Close calendar',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              if (widget.planningOnly)
                const Text(
                  'Planning date only. Provider availability has not been checked.',
                )
              else if (failed)
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    const Text('Couldn’t load dates. Availability unknown.'),
                    TextButton(
                      onPressed: () => setState(_load),
                      child: const Text('Retry'),
                    ),
                  ],
                )
              else if (data == null)
                Semantics(
                  liveRegion: true,
                  child: const Padding(
                    padding: EdgeInsets.all(8),
                    child: Text('Loading availability…'),
                  ),
                ),
              Row(
                children: [
                  for (final day in [
                    'Sun',
                    'Mon',
                    'Tue',
                    'Wed',
                    'Thu',
                    'Fri',
                    'Sat',
                  ])
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(day),
                        ),
                      ),
                    ),
                ],
              ),
              for (var week = 0; week < (offset + days + 6) ~/ 7; week++)
                Row(
                  children: [
                    for (var weekday = 0; weekday < 7; weekday++)
                      Expanded(
                        child: Builder(
                          builder: (context) {
                            final day = week * 7 + weekday - offset + 1;
                            if (day < 1 || day > days) {
                              return const SizedBox(height: 48);
                            }
                            final date = DateTime(month.year, month.month, day);
                            final state = status(date);
                            final chosen =
                                selected != null &&
                                calendarDateKey(selected!) ==
                                    calendarDateKey(date);
                            final past = date.isBefore(today);
                            final label =
                                '${localizations.formatFullDate(date)}, ${past ? 'Past date' : state.label}';
                            return Semantics(
                              label: label,
                              selected: chosen,
                              button: true,
                              enabled: selectable(date),
                              excludeSemantics: true,
                              child: SizedBox(
                                height: 48,
                                child: Material(
                                  color: chosen
                                      ? AppColors.primary
                                      : AppColors.surface,
                                  borderRadius: BorderRadius.circular(10),
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(10),
                                    onTap: selectable(date)
                                        ? () => setState(() => selected = date)
                                        : null,
                                    child: Opacity(
                                      opacity: past ? .4 : 1,
                                      child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Flexible(
                                            child: FittedBox(
                                              fit: BoxFit.scaleDown,
                                              child: Text(
                                                '$day',
                                                style: AppTypography.bodySmall
                                                    .copyWith(
                                                      color: chosen
                                                          ? AppColors
                                                                .primaryForeground
                                                          : AppColors.mainText,
                                                    ),
                                              ),
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          dot(state),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              const SizedBox(height: 12),
              Semantics(
                liveRegion: true,
                child: Text(
                  selected == null
                      ? 'Choose an available date'
                      : '${localizations.formatMediumDate(selected!)}: ${status(selected!).label}',
                  textAlign: TextAlign.center,
                ),
              ),
              const Divider(),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 16,
                runSpacing: 8,
                children: [
                  for (final state in CalendarAvailability.values.take(4))
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        dot(state),
                        const SizedBox(width: 6),
                        Flexible(child: Text(state.label)),
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Availability is checked again before booking.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: selected != null && selectable(selected!)
                    ? () => Navigator.pop(context, selected)
                    : null,
                child: const Text('Use selected date'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
