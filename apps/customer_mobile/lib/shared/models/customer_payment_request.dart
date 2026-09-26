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
        return 'Minimum payment';
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
    required this.checkoutOptions,
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
  final List<CustomerPaymentOption> checkoutOptions;

  bool get canStartCheckout => checkoutOptions.isNotEmpty;

  factory CustomerProviderPaymentRequest.fromDoc(
    DocumentSnapshot<Map<String, dynamic>> document, {
    required String mainEventStatus,
  }) {
    final data = document.data() ?? const <String, dynamic>{};

    return CustomerProviderPaymentRequest(
      id: document.id,
      mainEventId:
          _string(data['mainEventId']) ?? _string(data['bookingId']) ?? '',
      providerId: _string(data['providerId']) ?? '',
      providerBusinessName: _string(data['providerBusinessName']) ?? 'Provider',
      packageName: _string(data['packageName']) ?? 'Event service',
      status: _string(data['status']) ?? '',
      paymentStatus: _string(data['paymentStatus']) ?? 'unpaid',
      settlementStatus: _string(data['settlementStatus']),
      grossSettledAmountInCentavos: _centavos(
        data['grossSettledAmountInCentavos'],
      ),
      outstandingAmountInCentavos: _centavos(
        data['outstandingAmountInCentavos'],
      ),
      checkoutOptions: _checkoutOptions(data, mainEventStatus: mainEventStatus),
    );
  }
}

const _retryPaymentStatuses = <String>{
  'unpaid',
  'pending',
  'failed',
  'expired',
};

List<CustomerPaymentOption> _checkoutOptions(
  Map<String, dynamic> request, {
  required String mainEventStatus,
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

  if (request['activeCancellationRequestId'] != null ||
      request['reconciliationRequired'] == true) {
    return const [];
  }

  if (!_validRefundState(request)) {
    return const [];
  }

  final rawInitialChoice = _string(request['initialPaymentChoice']);
  final initialPaymentId = _string(request['initialPaymentId']);
  final remainingBalancePaymentId = _string(
    request['remainingBalancePaymentId'],
  );
  final currentPaymentId = _string(request['paymentId']);

  final partialDeposit = upfront > 0 && upfront < gross;

  final initialSelectionAbsent =
      rawInitialChoice == null && initialPaymentId == null;

  if (initialSelectionAbsent) {
    if (currentPaymentId != null ||
        remainingBalancePaymentId != null ||
        request['settlementSchemaVersion'] != null ||
        request['settlementStatus'] != null ||
        !_initialEligible(request, mainEventStatus)) {
      return const [];
    }

    if (partialDeposit) {
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
      initialPaymentId == null ||
      request['settlementSchemaVersion'] != 1) {
    return const [];
  }

  if (initialChoice == CustomerPaymentChoice.minimum && !partialDeposit) {
    return const [];
  }

  if (remainingBalancePaymentId != null &&
      initialChoice != CustomerPaymentChoice.minimum) {
    return const [];
  }

  final validCurrentPointer =
      currentPaymentId == initialPaymentId ||
      (remainingBalancePaymentId != null &&
          currentPaymentId == remainingBalancePaymentId);

  if (!validCurrentPointer) {
    return const [];
  }

  final settlementStatus = _string(request['settlementStatus']);
  final grossSettled = _centavos(request['grossSettledAmountInCentavos']);
  final outstanding = _centavos(request['outstandingAmountInCentavos']);
  final paymentStatus = _string(request['paymentStatus']) ?? 'unpaid';

  final balanceEligible =
      request['status'] == 'confirmed' &&
      mainEventStatus == 'confirmed' &&
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
    return [
      CustomerPaymentOption(
        choice: CustomerPaymentChoice.remainingBalance,
        amountInCentavos: balance,
      ),
    ];
  }

  if (remainingBalancePaymentId != null ||
      !_initialEligible(request, mainEventStatus) ||
      grossSettled != 0 ||
      outstanding != gross ||
      !const {
        'unpaid',
        'initial_payment_processing',
      }.contains(settlementStatus)) {
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

bool _initialEligible(Map<String, dynamic> request, String mainEventStatus) {
  final paymentStatus = _string(request['paymentStatus']) ?? 'unpaid';

  return request['status'] == 'waiting_for_down_payment' &&
      const {
        'pending_provider_approval',
        'needs_provider_replacement',
        'waiting_for_down_payment',
        'waiting_payment',
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
      refundState['activeCancellationRequestId'] == null &&
      request['refundPolicySnapshot'] != null &&
      request['refundPolicyAgreement'] != null;
}

CustomerPaymentChoice? _paymentChoice(String? value) {
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

  return Map<String, dynamic>.from(value);
}

String? _string(dynamic value) {
  if (value is! String) {
    return null;
  }

  final normalized = value.trim();

  return normalized.isEmpty ? null : normalized;
}

int? _centavos(dynamic value) {
  if (value is int && value >= 0) {
    return value;
  }

  return null;
}
