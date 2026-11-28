class RuntimeSecurity {
  RuntimeSecurity._();

  static const productionProjectId = 'feasta-catering-system';

  static void validateEmulatorMode({
    required bool useEmulators,
    required bool isDebugMode,
  }) {
    if (useEmulators && !isDebugMode) {
      throw StateError(
        'Firebase emulator mode is permitted only in debug builds.',
      );
    }
  }

  static void validateFirebaseProject({
    required String projectId,
    required bool isReleaseMode,
    String? expectedDemoProjectId,
  }) {
    if (expectedDemoProjectId != null &&
        (isReleaseMode ||
            !RegExp(r'^demo-[a-z0-9-]+$').hasMatch(expectedDemoProjectId) ||
            projectId != expectedDemoProjectId)) {
      throw StateError(
        'The initialized Firebase app does not match the isolated demo project.',
      );
    }
    if (isReleaseMode && projectId != productionProjectId) {
      throw StateError('Release Firebase project configuration is invalid.');
    }
  }

  static const sandboxCheckoutHost = 'feasta-web.vercel.app';
  static const sandboxCheckoutPath = '/customer/payments/sandbox-checkout';

  static Uri requireTrustedPayMongoCheckout(String value) {
    final uri = Uri.tryParse(value);
    final host = uri?.host.toLowerCase() ?? '';
    final isPayMongoHost =
        host == 'paymongo.com' || host.endsWith('.paymongo.com');
    final sandboxPaymentId = uri?.queryParameters['paymentId'] ?? '';
    final isTrustedSandboxCheckout = host == sandboxCheckoutHost &&
        uri?.path == sandboxCheckoutPath &&
        RegExp(r'^[A-Za-z0-9_-]{8,160}$').hasMatch(sandboxPaymentId);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.userInfo.isNotEmpty ||
        (!isPayMongoHost && !isTrustedSandboxCheckout)) {
      throw const FormatException('The checkout URL is not trusted.');
    }
    return uri;
  }

  static bool isSupportedIncomingLink(Uri uri, {required String appHost}) {
    return uri.scheme == 'https' &&
        uri.userInfo.isEmpty &&
        uri.host.toLowerCase() == appHost.toLowerCase();
  }
}
