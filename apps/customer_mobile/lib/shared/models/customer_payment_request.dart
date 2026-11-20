import 'dart:convert';

import 'initial_payment_deadline.dart';
import '../payments/booking_payment_projection.dart';
import 'package:crypto/crypto.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

enum CustomerPaymentChoice {
  minimum('minimum'),
  full('full'),
  remainingBalance('remaining_balance');

  const CustomerPaymentChoice(this.apiValue);

  final String apiValue;

  String get label {
    switch (this) {
      case CustomerPaymentChoice.minimum:
        return 'Deposit';
      case CustomerPaymentChoice.full:
        return 'Full payment';
      case CustomerPaymentChoice.remainingBalance:
        return 'Remaining balance';
    }
  }
}

class CustomerPaymentOption {
  const CustomerPaymentOption({
    required this.choice,
    required this.amountInCentavos,
  });

  final CustomerPaymentChoice choice;
  final int amountInCentavos;

  double get amount => amountInCentavos / 100;
}

class CustomerBookingVat {
  const CustomerBookingVat({
    required this.taxType,
    required this.includedVatInCentavos,
    required this.grossInCentavos,
  });

  final String taxType;
  final int includedVatInCentavos;
  final int grossInCentavos;

  int get exclusiveInCentavos => grossInCentavos - includedVatInCentavos;
}

/// Display-only projection of the frozen provider-request tax evidence.
/// Null means the evidence is unavailable or inconsistent.
CustomerBookingVat? customerBookingVatFromRequest(
  Map<String, dynamic> request,
) {
  final snapshot = _map(request['financialSnapshot']);
  if (snapshot == null ||
      snapshot['schemaVersion'] != 1 ||
      snapshot['currency'] != 'PHP' ||
      snapshot['providerTaxVerificationStatus'] != 'verified') {
    return null;
  }

  final taxType = snapshot['providerTaxType'];
  if (taxType != 'vat_registered' && taxType != 'non_vat') {
    return null;
  }

  final gross = _centavos(snapshot['grossAmountInCentavos']);
  final rawAmount = request['amount'];

  if (gross == null ||
      gross <= 0 ||
      rawAmount is! num ||
      !rawAmount.isFinite ||
      rawAmount <= 0 ||
      ((rawAmount.toDouble() * 100) - gross).abs() > 0.000001) {
    return null;
  }

  if (taxType == 'non_vat') {
    return CustomerBookingVat(
      taxType: 'non_vat',
      includedVatInCentavos: 0,
      grossInCentavos: gross,
    );
  }

  // FEASTA's frozen 12% VAT-inclusive component policy.
  // BigInt preserves exact half-up centavo rounding.
  final included =
      (BigInt.from(gross) * BigInt.from(1200) + BigInt.from(5600)) ~/
      BigInt.from(11200);

  if (included > BigInt.from(9007199254740991)) {
    return null;
  }

  return CustomerBookingVat(
    taxType: 'vat_registered',
    includedVatInCentavos: included.toInt(),
    grossInCentavos: gross,
  );
}

/// Display-only VAT projection for a special-request price offer.
/// Uses the offer total and its frozen `pricing` snapshot, matching web.
CustomerBookingVat? customerSpecialOfferVat(Map<String, dynamic> offer) {
  final total = _centavos(offer['totalInCentavos']);
  if (total == null || total <= 0) return null;
  return customerBookingVatFromRequest({
    'amount': total / 100,
    'financialSnapshot': offer['pricing'],
  });
}

/// Display-only provider commission from a special-request price offer.
/// Null means the fee breakdown is unavailable or inconsistent.
int? customerSpecialOfferProviderFeeInCentavos(Map<String, dynamic> offer) {
  final total = _centavos(offer['totalInCentavos']);
  final subtotal = _centavos(offer['subtotalInCentavos']);
  final pricing = _map(offer['pricing']);
  if (total == null ||
      subtotal == null ||
      pricing == null ||
      subtotal <= 0 ||
      subtotal > total) {
    return null;
  }

  final fee = _centavos(pricing['platformCommissionTotalInCentavos']);
  if (pricing['schemaVersion'] != 1 ||
      pricing['currency'] != 'PHP' ||
      pricing['grossAmountInCentavos'] != total ||
      fee == null ||
      fee < 0 ||
      fee > total) {
    return null;
  }

  return fee;
}

/// Explanation from the saved initial-payment eligibility, never device time.
/// Only server-approved versions/reasons produce customer-facing wording.
String? customerInitialPaymentExplanation(Map<String, dynamic> request) {
  final version = request['initialPaymentEligibilitySchemaVersion'];
  final value = request['initialPaymentEligibility'];
  if (value is! Map || (version != 1 && version != 2)) {
    return null;
  }

  if (value.keys.any((key) => key is! String)) {
    return null;
  }
  final eligibility = Map<String, dynamic>.from(value);
  if (eligibility['mode'] != 'full_only' ||
      eligibility['depositEligible'] != false ||
      eligibility['depositAllowed'] is! bool) {
    return null;
  }

  if (eligibility['reason'] == 'deposit_disabled' &&
      eligibility['depositAllowed'] == false) {
    return 'Full payment is required under the saved booking payment policy.';
  }

  if (eligibility['reason'] != 'short_notice' ||
      eligibility['depositAllowed'] != true) {
    return null;
  }

  final hours = eligibility['depositMinimumNoticeHours'];
  if (hours is! int || hours <= 0 || hours > 24 * 365) {
    return null;
  }

  if (version == 2) {
    if (hours != 72 ||
        eligibility['authorityTimeSource'] != 'booking_submission' ||
        eligibility['submittedAt'] == null ||
        eligibility['evaluatedAt'] == null) {
      return null;
    }

    return 'Full payment is required because the booking was submitted fewer than 3 days before the event.';
  }

  final amount = hours % 24 == 0 ? hours ~/ 24 : hours;
  final unit = hours % 24 == 0 ? 'day' : 'hour';
  final plural = amount == 1 ? '' : 's';

  return 'Full payment is required because fewer than $amount $unit$plural remained before the event when this booking was accepted.';
}

class CustomerProviderPaymentRequest {
  const CustomerProviderPaymentRequest({
    required this.id,
    required this.mainEventId,
    required this.providerId,
    required this.providerBusinessName,
    required this.packageName,
    required this.status,
    required this.paymentStatus,
    required this.settlementStatus,
    required this.grossSettledAmountInCentavos,
    required this.outstandingAmountInCentavos,
    this.remainingBalanceStatus,
    this.remainingBalanceDueAt,
    this.remainingBalanceGraceEndsAt,
    required this.checkoutOptions,
    this.initialPaymentDeadline,
    this.initialPaymentExplanation,
    this.serviceVat,
    this.agreedPackagePriceInCentavos,
    this.agreedTotalInCentavos,
    this.providerFeeInCentavos,
    this.commissionAccruedInCentavos,
    this.paymentId,
    this.initialPaymentId,
    this.remainingBalancePaymentId,
    this.paidAt,
    this.deliveryIncluded = false,
  });

  final String id;
  final String mainEventId;
  final String providerId;
  final String providerBusinessName;
  final String packageName;
  final String status;
  final String paymentStatus;
  final String? settlementStatus;
  final int? grossSettledAmountInCentavos;
  final int? outstandingAmountInCentavos;
  final String? remainingBalanceStatus;
  final DateTime? remainingBalanceDueAt;
  final DateTime? remainingBalanceGraceEndsAt;
  final List<CustomerPaymentOption> checkoutOptions;
  final InitialPaymentDeadline? initialPaymentDeadline;
  final String? initialPaymentExplanation;
  final CustomerBookingVat? serviceVat;
  final int? agreedPackagePriceInCentavos;
  final int? agreedTotalInCentavos;
  final int? providerFeeInCentavos;
  final int? commissionAccruedInCentavos;
  final String? paymentId;
  final String? initialPaymentId;
  final String? remainingBalancePaymentId;
  final DateTime? paidAt;
  final bool deliveryIncluded;

  bool get canStartCheckout => checkoutOptions.isNotEmpty;

  /// Customer-readable receipt entry when settlement or a payment id exists.
  bool get canViewPaymentReceipt {
    const receiptStatuses = {
      'paid',
      'partially_paid',
      'partially_refunded',
      'refunded',
    };
    if (!receiptStatuses.contains(paymentStatus)) {
      return false;
    }
    return paymentReferenceIds.isNotEmpty ||
        (grossSettledAmountInCentavos != null &&
            grossSettledAmountInCentavos! > 0);
  }

  List<String> get paymentReferenceIds {
    return <String?>[
      paymentId,
      initialPaymentId,
      remainingBalancePaymentId,
    ].whereType<String>().where((value) => value.trim().isNotEmpty).toSet().toList(
      growable: false,
    );
  }

  /// Prefer trusted ledger commission; fall back to frozen quote fee.
  int? get serviceChargeInCentavos =>
      commissionAccruedInCentavos ?? providerFeeInCentavos;

  factory CustomerProviderPaymentRequest.fromDoc(
    DocumentSnapshot<Map<String, dynamic>> document, {
    required String mainEventStatus,
    DateTime? now,
  }) {
    final data = document.data() ?? const <String, dynamic>{};
    final quote =
        _map(data['acceptedSpecialOffer']) ?? const <String, dynamic>{};
    final financial =
        _map(data['financialSnapshot']) ?? const <String, dynamic>{};
    final total = _centavos(quote['totalInCentavos']);
    final subtotal = _centavos(quote['subtotalInCentavos']);
    final amount = data['amount'];
    final hasQuote =
        total != null &&
        subtotal != null &&
        subtotal > 0 &&
        subtotal <= total &&
        amount is num &&
        amount.isFinite &&
        (amount * 100 - total).abs() < 0.000001;
    final commission = _centavos(
      financial['platformCommissionTotalInCentavos'],
    );
    final hasFee =
        hasQuote &&
        commission != null &&
        commission <= total &&
        financial['schemaVersion'] == 1 &&
        financial['currency'] == 'PHP' &&
        financial['grossAmountInCentavos'] == total;

    return CustomerProviderPaymentRequest(
      id: document.id,
      mainEventId:
          _string(data['mainEventId']) ?? _string(data['bookingId']) ?? '',
      providerId: _string(data['providerId']) ?? '',
      providerBusinessName: _string(data['providerBusinessName']) ?? 'Provider',
      packageName: _string(data['packageName']) ?? 'Event service',
      status: _string(data['status']) ?? '',
      paymentStatus: resolveCustomerProviderPaymentStatus(data),
      settlementStatus: _string(data['settlementStatus']),
      grossSettledAmountInCentavos: _centavos(
        data['grossSettledAmountInCentavos'],
      ),
      outstandingAmountInCentavos: _centavos(
        data['outstandingAmountInCentavos'],
      ),
      remainingBalanceStatus: _remainingBalanceStatus(
        data['remainingBalanceStatus'],
      ),
      remainingBalanceDueAt: _timestampDate(data['remainingBalanceDueAt']),
      remainingBalanceGraceEndsAt: _timestampDate(
        data['remainingBalanceGraceEndsAt'],
      ),
      initialPaymentDeadline: InitialPaymentDeadline.fromRecord(data),
      initialPaymentExplanation: customerInitialPaymentExplanation(data),
      serviceVat: customerBookingVatFromRequest(data),
      agreedPackagePriceInCentavos: hasQuote ? subtotal : null,
      agreedTotalInCentavos: hasQuote ? total : null,
      providerFeeInCentavos: hasFee ? commission : null,
      commissionAccruedInCentavos: _centavos(data['commissionAccruedInCentavos']),
      paymentId: _string(data['paymentId']),
      initialPaymentId: _string(data['initialPaymentId']),
      remainingBalancePaymentId: _string(data['remainingBalancePaymentId']),
      paidAt: _timestampDate(data['paidAt']),
      deliveryIncluded: hasQuote && quote['deliveryIncluded'] == true,
      checkoutOptions: _checkoutOptions(
        data,
        providerRequestId: document.id,
        mainEventStatus: mainEventStatus,
        now: now ?? DateTime.now(),
      ),
    );
  }
}

const _remainingBalanceStatuses = <String>{
  'not_applicable',
  'not_due',
  'due_soon',
  'due',
  'grace_period',
  'overdue',
  'paid',
  'cancelled',
};

String? _remainingBalanceStatus(dynamic value) {
  final normalized = _string(value);

  if (normalized == null || !_remainingBalanceStatuses.contains(normalized)) {
    return null;
  }

  return normalized;
}

DateTime? _timestampDate(dynamic value) {
  if (value is Timestamp) {
    return value.toDate();
  }

  if (value is DateTime) {
    return value;
  }

  if (value is String) {
    return DateTime.tryParse(value);
  }

  return null;
}

const _retryPaymentStatuses = <String>{
  'unpaid',
  'pending',
  'failed',
  'expired',
};

enum _InitialEligibility { invalid, minimumOrFull, fullOnly }

// Read the frozen server decision; amounts and the checkout clock never grant
// deposit permission. Legacy means all three canonical fields are absent/null.
_InitialEligibility _initialPaymentEligibility(Map<String, dynamic> request) {
  final version = request['initialPaymentEligibilitySchemaVersion'];
  if (version == null &&
      request['initialPaymentEligibility'] == null &&
      request['bookingPaymentPolicySnapshot'] == null) {
    return _InitialEligibility.minimumOrFull;
  }
  final data = _map(request['initialPaymentEligibility']);
  if ((version != 1 && version != 2) || data == null) {
    return _InitialEligibility.invalid;
  }
  final mode = data['mode'];
  final reason = data['reason'];
  final hours = _centavos(data['depositMinimumNoticeHours']);
  if ((mode != 'minimum_or_full' && mode != 'full_only') ||
      data['depositEligible'] != (mode == 'minimum_or_full') ||
      data['depositAllowed'] is! bool ||
      !const {
        'deposit_eligible',
        'package_full_payment',
        'deposit_disabled',
        'short_notice',
      }.contains(reason) ||
      (reason == 'deposit_eligible') != data['depositEligible'] ||
      ((reason == 'deposit_eligible' || reason == 'short_notice') &&
          data['depositAllowed'] != true) ||
      (reason == 'deposit_disabled' && data['depositAllowed'] != false) ||
      (reason != 'package_full_payment' &&
          (hours == null || hours <= 0 || hours > 24 * 365)) ||
      (version == 2 &&
          (data['authorityTimeSource'] != 'booking_submission' ||
              data['depositMinimumNoticeHours'] != 72 ||
              data['submittedAt'] == null ||
              data['evaluatedAt'] == null))) {
    return _InitialEligibility.invalid;
  }
  return mode == 'minimum_or_full'
      ? _InitialEligibility.minimumOrFull
      : _InitialEligibility.fullOnly;
}

String _paymentId(String requestId, CustomerPaymentChoice choice) =>
    'payment_${sha256.convert(utf8.encode('provider-request:$requestId:payment-choice:${choice.apiValue}:v1')).toString().substring(0, 32)}';

// Checkout projection of Web's remaining-balance enforcement. The callable
// remains authoritative, including when a device clock or saved view is stale.
bool _balanceEnforcementBlocksActions(
  Map<String, dynamic> request,
  DateTime now,
) {
  final version = request['remainingBalanceTimingSchemaVersion'];
  final enforcement = _map(request['remainingBalanceEnforcement']);
  if (version == 3) {
    final event = _timestampDate(request['eventStartAt']);
    final due = _timestampDate(request['remainingBalanceDueAt']);
    final hard = _timestampDate(request['hardPaymentDeadlineAt']);
    final prep = _timestampDate(request['preparationStartsAt']);
    final policy = _map(request['bookingLifecyclePolicySnapshot']);
    if (event == null ||
        due == null ||
        hard == null ||
        prep == null ||
        request['balanceDueHoursBeforeEvent'] != 48 ||
        due != event.subtract(const Duration(hours: 48)) ||
        hard != event.subtract(const Duration(hours: 24)) ||
        prep != hard ||
        policy == null ||
        policy['schemaVersion'] != 3 ||
        policy['providerStartsManually'] != false ||
        policy['requiresFullPayment'] != true ||
        policy['autoStartAtScheduledTime'] != true ||
        policy['providerConfirmsCompletion'] != true ||
        const {
          'on_hold',
          'reconciliation_required',
        }.contains(enforcement?['status'])) {
      return true;
    }
    return !now.isBefore(hard);
  }
  if (version != 2) return false;
  if (request['remainingBalanceEnforcementSchemaVersion'] != null &&
      (request['remainingBalanceEnforcementSchemaVersion'] != 1 ||
          enforcement?['status'] != 'clear')) {
    return true;
  }
  final due = _timestampDate(request['remainingBalanceDueAt']);
  return due == null || !now.isBefore(due);
}

List<CustomerPaymentOption> _checkoutOptions(
  Map<String, dynamic> request, {
  required String mainEventStatus,
  required String providerRequestId,
  required DateTime now,
}) {
  final financialSnapshot = _map(request['financialSnapshot']);

  if (financialSnapshot == null ||
      financialSnapshot['schemaVersion'] != 1 ||
      financialSnapshot['currency'] != 'PHP') {
    return const [];
  }

  final gross = _centavos(financialSnapshot['grossAmountInCentavos']);
  final upfront = _centavos(
    financialSnapshot['requiredUpfrontAmountInCentavos'],
  );
  final balance = _centavos(financialSnapshot['remainingBalanceInCentavos']);

  if (gross == null ||
      upfront == null ||
      balance == null ||
      gross <= 0 ||
      upfront + balance != gross) {
    return const [];
  }

  if ((request['initialPaymentReview'] != null &&
          const {
            'accepted',
            'waiting_for_down_payment',
            'payment_processing',
          }.contains(request['status'])) ||
      request['lifecycleReconciliationRequired'] == true ||
      request['activeCancellationRequestId'] != null ||
      request['approvedCancellationRequestId'] != null ||
      request['refundExecutionLock'] != null ||
      request['reconciliationRequired'] == true) {
    return const [];
  }

  if (!_validRefundState(request)) {
    return const [];
  }

  final rawInitialChoice = request['initialPaymentChoice'];
  final initialPaymentId = request['initialPaymentId'];
  final remainingBalancePaymentId = request['remainingBalancePaymentId'];
  final currentPaymentId = request['paymentId'];
  final eligibility = _initialPaymentEligibility(request);

  final partialDeposit = upfront > 0 && upfront < gross;

  final initialSelectionAbsent =
      rawInitialChoice == null && initialPaymentId == null;

  if (initialSelectionAbsent) {
    if (currentPaymentId != null ||
        remainingBalancePaymentId != null ||
        request['settlementSchemaVersion'] != null ||
        request['settlementStatus'] != null ||
        !_initialEligible(request, mainEventStatus, now) ||
        eligibility == _InitialEligibility.invalid) {
      return const [];
    }

    if (partialDeposit && eligibility == _InitialEligibility.minimumOrFull) {
      return [
        CustomerPaymentOption(
          choice: CustomerPaymentChoice.minimum,
          amountInCentavos: upfront,
        ),
        CustomerPaymentOption(
          choice: CustomerPaymentChoice.full,
          amountInCentavos: gross,
        ),
      ];
    }

    return [
      CustomerPaymentOption(
        choice: CustomerPaymentChoice.full,
        amountInCentavos: gross,
      ),
    ];
  }

  final initialChoice = _paymentChoice(rawInitialChoice);

  if (initialChoice == null ||
      initialChoice == CustomerPaymentChoice.remainingBalance ||
      initialPaymentId != _paymentId(providerRequestId, initialChoice) ||
      request['settlementSchemaVersion'] != 1) {
    return const [];
  }

  if (initialChoice == CustomerPaymentChoice.minimum && !partialDeposit) {
    return const [];
  }

  if (remainingBalancePaymentId != null &&
      (initialChoice != CustomerPaymentChoice.minimum ||
          remainingBalancePaymentId !=
              _paymentId(
                providerRequestId,
                CustomerPaymentChoice.remainingBalance,
              ))) {
    return const [];
  }

  final validCurrentPointer =
      currentPaymentId == initialPaymentId ||
      (remainingBalancePaymentId != null &&
          currentPaymentId == remainingBalancePaymentId);

  if (!validCurrentPointer) {
    return const [];
  }

  final settlementStatus = request['settlementStatus'];
  final grossSettled = _centavos(request['grossSettledAmountInCentavos']);
  final outstanding = _centavos(request['outstandingAmountInCentavos']);
  final paymentStatus = request['paymentStatus'];

  final balanceEligible =
      request['status'] == 'confirmed' &&
      const {
        'pending_provider_approval',
        'needs_provider_replacement',
        'waiting_for_down_payment',
        'confirmed',
      }.contains(mainEventStatus) &&
      initialChoice == CustomerPaymentChoice.minimum &&
      settlementStatus == 'deposit_settled' &&
      grossSettled == upfront &&
      outstanding == balance &&
      balance > 0 &&
      (remainingBalancePaymentId == null
          ? const {
              'paid',
              'partially_refunded',
              'refunded',
            }.contains(paymentStatus)
          : currentPaymentId == remainingBalancePaymentId &&
                _retryPaymentStatuses.contains(paymentStatus));

  if (balanceEligible) {
    if (_balanceEnforcementBlocksActions(request, now)) {
      return const [];
    }
    return [
      CustomerPaymentOption(
        choice: CustomerPaymentChoice.remainingBalance,
        amountInCentavos: balance,
      ),
    ];
  }

  if (remainingBalancePaymentId != null ||
      !_initialEligible(request, mainEventStatus, now) ||
      grossSettled != 0 ||
      outstanding != gross ||
      !const {
        'unpaid',
        'initial_payment_processing',
      }.contains(settlementStatus)) {
    return const [];
  }

  if (eligibility == _InitialEligibility.invalid ||
      (initialChoice == CustomerPaymentChoice.minimum &&
          eligibility != _InitialEligibility.minimumOrFull)) {
    return const [];
  }

  return [
    CustomerPaymentOption(
      choice: initialChoice,
      amountInCentavos: initialChoice == CustomerPaymentChoice.minimum
          ? upfront
          : gross,
    ),
  ];
}

bool _initialEligible(
  Map<String, dynamic> request,
  String mainEventStatus,
  DateTime now,
) {
  final paymentStatus = request['paymentStatus'];
  final deadline = InitialPaymentDeadline.fromRecord(request);

  // Device time is never payment authority. The callable checks expiration
  // transactionally on every checkout, including retries and stale app screens.
  return deadline.hasValidEvidence &&
      (request['initialPaymentDeadlinePolicyVersion'] == null ||
          (deadline.at != null && now.isBefore(deadline.at!))) &&
      request['status'] == 'waiting_for_down_payment' &&
      const {
        'pending_provider_approval',
        'needs_provider_replacement',
        'waiting_for_down_payment',
      }.contains(mainEventStatus) &&
      _retryPaymentStatuses.contains(paymentStatus);
}

bool _validRefundState(Map<String, dynamic> request) {
  final hasRefundEvidence =
      request['refundEligibilityState'] != null ||
      request['refundPolicySnapshot'] != null ||
      request['refundPolicyAgreement'] != null;

  if (!hasRefundEvidence) {
    return true;
  }

  final refundState = _map(request['refundEligibilityState']);

  return refundState != null &&
      refundState['schemaVersion'] == 1 &&
      refundState.containsKey('activeCancellationRequestId') &&
      refundState['activeCancellationRequestId'] == null &&
      _storedTruthy(request['refundPolicySnapshot']) &&
      _storedTruthy(request['refundPolicyAgreement']);
}

bool _storedTruthy(dynamic value) =>
    value != null &&
    value != false &&
    value != '' &&
    value != 0 &&
    !(value is double && value.isNaN);

CustomerPaymentChoice? _paymentChoice(dynamic value) {
  switch (value) {
    case 'minimum':
      return CustomerPaymentChoice.minimum;
    case 'full':
      return CustomerPaymentChoice.full;
    case 'remaining_balance':
      return CustomerPaymentChoice.remainingBalance;
    default:
      return null;
  }
}

Map<String, dynamic>? _map(dynamic value) {
  if (value is! Map) {
    return null;
  }

  return value.keys.every((key) => key is String)
      ? Map<String, dynamic>.from(value)
      : null;
}

String? _string(dynamic value) {
  if (value is! String) {
    return null;
  }

  final normalized = value.trim();

  return normalized.isEmpty ? null : normalized;
}

int? _centavos(dynamic value) {
  if (value is num &&
      value.isFinite &&
      value >= 0 &&
      value <= 9007199254740991 &&
      value == value.truncateToDouble()) {
    return value.toInt();
  }

  return null;
}
