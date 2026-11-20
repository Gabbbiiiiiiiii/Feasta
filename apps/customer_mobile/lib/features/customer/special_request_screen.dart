import 'dart:convert';
import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/booking_refund_policy.dart';
import '../../shared/models/customer_payment_request.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/models/provider_calendar_month.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_details_screen.dart';
import 'booking_refund_policy_terms.dart';
import 'widgets/provider_calendar.dart';

FirebaseFunctions get _functions =>
    FirebaseFunctions.instanceFor(region: 'asia-southeast1');

num? specialRequestDropOffPrice(PackageModel package) {
  final option = package.serviceOptions['drop_off'];
  final price = option?['price'];
  return option?['enabled'] != false &&
          price is num &&
          price.isFinite &&
          price > 0
      ? price
      : null;
}

String specialRequestMoney(num amount) => '₱${amount.toStringAsFixed(2)}';

({String label, FeastaStatusTone tone}) specialRequestStatus(String status) {
  return switch (status) {
    'pending_review' => (label: 'Under review', tone: FeastaStatusTone.neutral),
    'needs_clarification' => (
      label: 'Provider needs more details',
      tone: FeastaStatusTone.warning,
    ),
    'quotation_sent' => (
      label: 'Price offer received',
      tone: FeastaStatusTone.info,
    ),
    'revision_requested' => (
      label: 'Changes requested',
      tone: FeastaStatusTone.neutral,
    ),
    'quotation_accepted' => (
      label: 'Offer accepted',
      tone: FeastaStatusTone.success,
    ),
    'converted_to_booking' => (
      label: 'Booking created',
      tone: FeastaStatusTone.success,
    ),
    'declined' => (label: 'Declined', tone: FeastaStatusTone.error),
    'cancelled' => (label: 'Cancelled', tone: FeastaStatusTone.neutral),
    'expired' => (label: 'Offer expired', tone: FeastaStatusTone.neutral),
    _ => (label: 'Status unavailable', tone: FeastaStatusTone.neutral),
  };
}

class SpecialRequestForm extends StatefulWidget {
  const SpecialRequestForm({super.key, required this.package, this.repository});

  final PackageModel package;
  final FeastaRepository? repository;

  @override
  State<SpecialRequestForm> createState() => _SpecialRequestFormState();
}

class _SpecialRequestFormState extends State<SpecialRequestForm> {
  final _form = GlobalKey<FormState>();
  final _quantity = TextEditingController(text: '1');
  final _address = TextEditingController();
  final _instructions = TextEditingController();
  final _deliveryInstructions = TextEditingController();
  final _random = Random.secure();
  late final FeastaRepository _repository =
      widget.repository ?? FeastaRepository();
  String? _lastPayload;
  String? _submissionId;
  DateTime? _date;
  TimeOfDay? _start;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _quantity.dispose();
    _address.dispose();
    _instructions.dispose();
    _deliveryInstructions.dispose();
    super.dispose();
  }

  String _clock(TimeOfDay time) =>
      '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

  Future<void> _pickDate() async {
    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppRadius.dialog),
        ),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .9,
        maxWidth: 420,
      ),
      builder: (_) => ProviderCalendar(
        providerId: widget.package.providerId,
        selectedDate: _date,
        loadMonth: _repository.getProviderCalendarMonth,
        planningOnly: false,
      ),
    );
    if (!mounted || picked == null) return;
    setState(() {
      _date = picked;
      _error = null;
    });
  }

  Future<void> _pickTime() async {
    final value = await showTimePicker(
      context: context,
      initialTime: _start ?? TimeOfDay.now(),
    );
    if (mounted && value != null) {
      setState(() {
        _start = value;
        _error = null;
      });
    }
  }

  Future<bool> _verifyCalendarDate(DateTime date) async {
    try {
      final result = await _repository.getProviderCalendarMonth(
        widget.package.providerId,
        calendarDateKey(date).substring(0, 7),
      );
      if (!mounted) return false;
      if (result.status(date) != CalendarAvailability.available) {
        setState(
          () =>
              _error = 'This date is no longer available. Choose another date.',
        );
        return false;
      }
      return true;
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Calendar availability could not be verified. Review your event date and try again.',
        );
      }
      return false;
    }
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    final date = _date;
    final start = _start;
    if (date == null) {
      setState(
        () => _error = 'Choose an available event date from the calendar.',
      );
      return;
    }
    if (start == null) {
      setState(() => _error = 'Choose a drop-off time.');
      return;
    }

    final data = {
      'packageId': widget.package.id,
      'quantity': int.parse(_quantity.text.trim()),
      'eventDate': calendarDateKey(date),
      'eventTime': _clock(start),
      'address': _address.text.trim(),
      'instructions': _instructions.text.trim(),
      'deliveryInstructions': _deliveryInstructions.text.trim(),
    };
    final payload = jsonEncode(data);
    if (_lastPayload != payload) {
      _lastPayload = payload;
      _submissionId = List.generate(
        24,
        (_) => _random.nextInt(256),
      ).map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!await _verifyCalendarDate(date)) return;
      await _functions.httpsCallable('submitSpecialRequest').call({
        ...data,
        'submissionId': _submissionId,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Special request submitted.')),
      );
      await Navigator.of(context).pushReplacement<void, void>(
        MaterialPageRoute(builder: (_) => const SpecialRequestTracker()),
      );
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(
          () => _error = error.message ?? 'Unable to submit the request.',
        );
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to submit the request.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final package = widget.package;
    final unitPrice = specialRequestDropOffPrice(package);
    final quantityText = _quantity.text.trim();
    final quantity = RegExp(r'^[0-9]+$').hasMatch(quantityText)
        ? int.tryParse(quantityText)
        : null;
    final validQuantity = quantity != null && quantity >= 1 && quantity <= 100;
    final dateLabel = _date == null
        ? 'Select event date'
        : MaterialLocalizations.of(context).formatFullDate(_date!);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Special Request'),
        actions: [
          TextButton(
            onPressed: _busy
                ? null
                : () => Navigator.of(context).push<void>(
                    MaterialPageRoute(
                      builder: (_) => const SpecialRequestTracker(),
                    ),
                  ),
            child: const Text('My requests'),
          ),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.screen),
            children: [
              Text(
                package.name,
                style: AppTypography.sectionTitle.copyWith(
                  color: AppColors.primaryStrong,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                'Send your package requirements to the provider for review.',
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              FeastaTextField(
                label: 'Quantity',
                controller: _quantity,
                enabled: !_busy,
                isRequired: true,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                maxLength: 3,
                helperText: 'Enter a whole quantity from 1 to 100.',
                onChanged: (_) => setState(() {}),
                validator: (_) => validQuantity
                    ? null
                    : 'Enter a whole number from 1 to 100.',
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                'Event date',
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              OutlinedButton(
                onPressed: _busy ? null : _pickDate,
                style: OutlinedButton.styleFrom(
                  alignment: Alignment.centerLeft,
                  minimumSize: const Size.fromHeight(52),
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                  ),
                  foregroundColor: _date == null
                      ? AppColors.placeholder
                      : AppColors.mainText,
                  side: const BorderSide(color: AppColors.controlBorder),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppRadius.medium),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        dateLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const Icon(
                      Icons.calendar_month_outlined,
                      color: AppColors.primary,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                'Choose an available date. The provider reviews your order before sending an offer.',
                style: AppTypography.caption.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                'Drop-Off Time',
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              OutlinedButton(
                onPressed: _busy ? null : _pickTime,
                style: OutlinedButton.styleFrom(
                  alignment: Alignment.centerLeft,
                  minimumSize: const Size.fromHeight(52),
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                  ),
                  foregroundColor: _start == null
                      ? AppColors.placeholder
                      : AppColors.mainText,
                  side: const BorderSide(color: AppColors.controlBorder),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppRadius.medium),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _start?.format(context) ?? 'Select drop-off time',
                      ),
                    ),
                    const Icon(
                      Icons.schedule_outlined,
                      color: AppColors.primary,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              FeastaTextField(
                label: 'Delivery address',
                controller: _address,
                enabled: !_busy,
                isRequired: true,
                maxLength: 500,
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Enter the delivery address.'
                    : null,
              ),
              const SizedBox(height: AppSpacing.md),
              FeastaTextField(
                label: 'Delivery instructions (optional)',
                controller: _deliveryInstructions,
                enabled: !_busy,
                maxLength: 1000,
                maxLines: 3,
                minLines: 2,
              ),
              const SizedBox(height: AppSpacing.md),
              FeastaTextField(
                label: 'Special instructions (optional)',
                controller: _instructions,
                enabled: !_busy,
                maxLength: 2000,
                maxLines: 4,
                minLines: 3,
              ),
              const SizedBox(height: AppSpacing.lg),
              if (unitPrice != null) ...[
                Text(
                  'Published unit price ${specialRequestMoney(unitPrice)}',
                  style: AppTypography.body.copyWith(color: AppColors.mainText),
                ),
                const SizedBox(height: AppSpacing.xxs),
                if (validQuantity)
                  Text(
                    'Estimated subtotal ${specialRequestMoney(unitPrice * quantity)}',
                    style: AppTypography.cardTitle.copyWith(
                      color: AppColors.primaryStrong,
                      fontWeight: FontWeight.w800,
                    ),
                  )
                else
                  Text(
                    'Enter a whole quantity from 1 to 100.',
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
              ],
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Delivery is included. The provider will review your request. '
                'Submitting does not reserve the date or charge you.',
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(
                  _error!,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.error,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              FilledButton(
                onPressed: _busy || unitPrice == null || !validQuantity
                    ? null
                    : _submit,
                child: Text(_busy ? 'Submitting…' : 'Submit Special Request'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SpecialRequestTracker extends StatefulWidget {
  const SpecialRequestTracker({super.key, this.initialRequestId});

  /// When set from a notification, open this request after the list loads.
  final String? initialRequestId;

  @override
  State<SpecialRequestTracker> createState() => _SpecialRequestTrackerState();
}

class _SpecialRequestTrackerState extends State<SpecialRequestTracker> {
  late Future<List<Map<String, dynamic>>> _requests = _fetch();
  bool _saving = false;
  bool _openedInitial = false;

  Future<List<Map<String, dynamic>>> _fetch() async {
    final response = await _functions.httpsCallable('listSpecialRequests').call(
      {'view': 'customer'},
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    return (data['requests'] as List)
        .map((row) => Map<String, dynamic>.from(row as Map))
        .toList();
  }

  Future<Map<String, dynamic>?> _fetchDetail(String id) async {
    final response = await _functions.httpsCallable('listSpecialRequests').call(
      {'view': 'customer', 'id': id},
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    final rows = data['requests'] as List?;
    if (rows == null || rows.isEmpty) return null;
    return Map<String, dynamic>.from(rows.first as Map);
  }

  void _refresh() => setState(() => _requests = _fetch());

  void _maybeOpenInitial(List<Map<String, dynamic>> rows) {
    final id = widget.initialRequestId?.trim();
    if (_openedInitial || id == null || id.isEmpty) return;
    _openedInitial = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      Map<String, dynamic>? row;
      for (final item in rows) {
        if (item['id'] == id) {
          row = item;
          break;
        }
      }
      row ??= await _fetchDetail(id);
      if (!mounted) return;
      if (row == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('This special request could not be found.'),
          ),
        );
        return;
      }
      await _openRequest(row);
    });
  }

  Future<void> _update(
    String id,
    String action, {
    String? message,
    int? offerVersion,
    List<Map<String, String>>? policyAcknowledgements,
  }) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final response = await _functions
          .httpsCallable('updateSpecialRequest')
          .call({
            'id': id,
            'action': action,
            'message': message,
            'offerVersion': ?offerVersion,
            'policyAcknowledgements': ?policyAcknowledgements,
          });
      if (!mounted) return;
      _refresh();
      final data = response.data;
      final bookingId = data is Map ? data['bookingId'] : null;
      if (action == 'accept' && bookingId is String) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Offer accepted. Complete payment before the deadline to confirm your booking.',
            ),
          ),
        );
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => BookingDetailsScreen(bookingId: bookingId),
          ),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message ?? 'Unable to update request.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to update request.')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _clarify(String id) async {
    var message = '';
    final reply = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reply to provider'),
        content: TextField(
          maxLines: 3,
          maxLength: 2000,
          onChanged: (value) => message = value,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Back'),
          ),
          FilledButton(
            onPressed: () {
              if (message.trim().isNotEmpty) {
                Navigator.pop(context, message.trim());
              }
            },
            child: const Text('Send'),
          ),
        ],
      ),
    );
    if (mounted && reply != null) {
      await _update(id, 'clarify', message: reply);
    }
  }

  Future<void> _acceptOffer(Map<String, dynamic> summary) async {
    final id = summary['id'] as String;
    final offer = summary['priceOffer'];
    if (offer is! Map || offer['version'] is! int) return;

    Map<String, dynamic> detail = summary;
    List<BookingRefundPolicy> policies = const [];
    String? policyError;
    try {
      final loaded = await _fetchDetail(id);
      if (loaded != null) detail = loaded;
      policyError = detail['refundPolicyError'] as String?;
      final raw = detail['refundPolicies'];
      if (raw is List) {
        policies = raw.map(BookingRefundPolicy.fromJson).toList();
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Unable to load the current offer terms. Refresh and try again.',
          ),
        ),
      );
      return;
    }
    if (!mounted) return;
    if (policyError != null && policyError.isNotEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(policyError)));
      return;
    }

    final acknowledgements = <String, bool>{
      for (final policy in policies) policy.providerId: false,
    };
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final ready =
                policies.isEmpty ||
                policies.every((p) => acknowledgements[p.providerId] == true);
            return AlertDialog(
              title: const Text('Accept Price Offer?'),
              content: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'By accepting this ${specialRequestMoney((offer['totalInCentavos'] as num) / 100)} offer, '
                      'you agree to the provider\'s quotation. Your booking will be created with an Awaiting Payment status.',
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    const Text(
                      'Your booking will only be confirmed after FEASTA verifies the required payment.',
                    ),
                    for (final policy in policies) ...[
                      const SizedBox(height: AppSpacing.md),
                      BookingRefundPolicyTerms(
                        policy: policy,
                        acknowledged: acknowledgements[policy.providerId]!,
                        onChanged: (value) => setDialogState(() {
                          acknowledgements[policy.providerId] = value ?? false;
                        }),
                      ),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: ready ? () => Navigator.pop(context, true) : null,
                  child: const Text('Accept & Proceed to Payment'),
                ),
              ],
            );
          },
        );
      },
    );
    if (!mounted || confirmed != true) return;
    await _update(
      id,
      'accept',
      offerVersion: offer['version'] as int,
      policyAcknowledgements: [
        for (final policy in policies) policy.acknowledgement,
      ],
    );
  }

  Future<void> _openRequest(Map<String, dynamic> row) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppRadius.dialog),
        ),
      ),
      builder: (context) {
        final status = specialRequestStatus(row['status'] as String);
        final offer = row['priceOffer'];
        final bookingId = row['bookingId'];
        final eventDate = row['eventDate'] as String? ?? '';
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screen,
              AppSpacing.md,
              AppSpacing.screen,
              AppSpacing.screen,
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Special Request Details',
                          style: AppTypography.sectionTitle.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      FeastaStatusBadge(label: status.label, tone: status.tone),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    'Reference ${row['id']}',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _DetailRow(
                    label: 'Provider',
                    value: '${row['providerName']}',
                  ),
                  _DetailRow(label: 'Package', value: '${row['packageName']}'),
                  _DetailRow(label: 'Quantity', value: '${row['quantity']}'),
                  _DetailRow(label: 'Event date', value: eventDate),
                  _DetailRow(
                    label: 'Drop-Off Time',
                    value: '${row['eventTime']}',
                  ),
                  if (row['address'] is String &&
                      (row['address'] as String).isNotEmpty)
                    _DetailRow(
                      label: 'Delivery address',
                      value: row['address'] as String,
                    ),
                  if (offer is Map) ...[
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      'Price Offer',
                      style: AppTypography.cardTitle.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    _DetailRow(
                      label: 'Package subtotal',
                      value: specialRequestMoney(
                        (offer['subtotalInCentavos'] as num) / 100,
                      ),
                    ),
                    ..._specialOfferVatRows(Map<String, dynamic>.from(offer)),
                    if (customerSpecialOfferProviderFeeInCentavos(
                          Map<String, dynamic>.from(offer),
                        )
                        case final fee?)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                        child: Text(
                          'Service charge ${specialRequestMoney(fee / 100)} is deducted from provider proceeds. It is not an additional customer charge.',
                          style: AppTypography.bodySmall.copyWith(
                            color: AppColors.secondaryTextAccessible,
                          ),
                        ),
                      ),
                    _DetailRow(
                      label: 'Total offered',
                      value: specialRequestMoney(
                        (offer['totalInCentavos'] as num) / 100,
                      ),
                    ),
                    Text(
                      offer['deliveryIncluded'] == true
                          ? 'Delivery included. The provider will deliver your order to the specified event address.'
                          : 'This earlier offer keeps its original quoted total.',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                    if (offer['notes'] is String &&
                        (offer['notes'] as String).isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(offer['notes'] as String),
                    ],
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  if (row['status'] == 'quotation_sent' &&
                      offer is Map &&
                      offer['version'] is int &&
                      offer['expiresAtMs'] is int &&
                      row['dropOffEligible'] != false)
                    FilledButton(
                      onPressed: _saving
                          ? null
                          : () {
                              Navigator.pop(context);
                              _acceptOffer(row);
                            },
                      child: const Text('Accept Offer'),
                    ),
                  if (row['status'] == 'quotation_sent' &&
                      offer is Map &&
                      offer['version'] is int)
                    TextButton(
                      onPressed: _saving
                          ? null
                          : () {
                              Navigator.pop(context);
                              _update(
                                row['id'] as String,
                                'declineOffer',
                                offerVersion: offer['version'] as int,
                              );
                            },
                      child: const Text('Decline Offer'),
                    ),
                  if (bookingId is String)
                    TextButton(
                      onPressed: () {
                        Navigator.pop(context);
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) =>
                                BookingDetailsScreen(bookingId: bookingId),
                          ),
                        );
                      },
                      child: const Text('View Booking & Payment'),
                    ),
                  if (row['status'] == 'needs_clarification')
                    TextButton(
                      onPressed: _saving
                          ? null
                          : () {
                              Navigator.pop(context);
                              _clarify(row['id'] as String);
                            },
                      child: const Text('Reply to provider'),
                    ),
                  if ([
                    'pending_review',
                    'needs_clarification',
                    'revision_requested',
                  ].contains(row['status']))
                    TextButton(
                      onPressed: _saving
                          ? null
                          : () {
                              Navigator.pop(context);
                              _update(row['id'] as String, 'cancel');
                            },
                      child: const Text('Cancel request'),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(
      title: const Text('My Special Requests'),
      actions: [
        IconButton(
          onPressed: _refresh,
          tooltip: 'Refresh',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder(
      future: _requests,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(
            child: TextButton(
              onPressed: _refresh,
              child: const Text('Unable to load your requests. Try again'),
            ),
          );
        }
        final rows = snapshot.data ?? [];
        _maybeOpenInitial(rows);
        if (rows.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.screen),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: const BoxDecoration(
                      color: AppColors.primarySubtle,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.description_outlined,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'No special requests yet',
                    style: AppTypography.cardTitle.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    'Your submitted requests and price offers will appear here.',
                    textAlign: TextAlign.center,
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                ],
              ),
            ),
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(AppSpacing.screen),
          itemCount: rows.length,
          separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
          itemBuilder: (context, index) {
            final row = rows[index];
            final status = specialRequestStatus(row['status'] as String);
            final offer = row['priceOffer'];
            final quantity = row['quantity'] as num? ?? 0;
            return FeastaCard(
              showBorder: true,
              showShadow: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${row['packageName']}',
                              style: AppTypography.cardTitle.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${row['providerName']}',
                              style: AppTypography.bodySmall.copyWith(
                                color: AppColors.secondaryTextAccessible,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      FeastaStatusBadge(label: status.label, tone: status.tone),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppSpacing.sm),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceMuted.withValues(alpha: 0.55),
                      borderRadius: BorderRadius.circular(AppRadius.medium),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.calendar_month_outlined,
                              size: 16,
                              color: AppColors.secondaryTextAccessible,
                            ),
                            const SizedBox(width: AppSpacing.xs),
                            Expanded(child: Text('${row['eventDate']}')),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Row(
                          children: [
                            const Icon(
                              Icons.inventory_2_outlined,
                              size: 16,
                              color: AppColors.secondaryTextAccessible,
                            ),
                            const SizedBox(width: AppSpacing.xs),
                            Expanded(
                              child: Text(
                                '$quantity ${quantity == 1 ? 'package' : 'packages'}',
                              ),
                            ),
                          ],
                        ),
                        if (offer is Map) ...[
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            'Total offered ${specialRequestMoney((offer['totalInCentavos'] as num) / 100)}',
                            style: AppTypography.label.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton.icon(
                      onPressed: () => _openRequest(row),
                      icon: const Icon(Icons.visibility_outlined, size: 18),
                      label: Text(
                        row['status'] == 'quotation_sent'
                            ? 'Review Offer'
                            : 'View Request',
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    ),
  );
}

List<Widget> _specialOfferVatRows(Map<String, dynamic> offer) {
  final vat = customerSpecialOfferVat(offer);
  if (vat == null) {
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.xs),
        child: Text(
          'This offer has no verified provider VAT breakdown. Your accepted total still applies.',
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
          ),
        ),
      ),
    ];
  }
  return [
    _DetailRow(
      label: vat.taxType == 'vat_registered'
          ? 'Included provider VAT'
          : 'Provider VAT not applicable',
      value: specialRequestMoney(vat.includedVatInCentavos / 100),
    ),
  ];
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: AppTypography.bodySmall.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
