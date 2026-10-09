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
  }) {
    if (isReleaseMode && projectId != productionProjectId) {
      throw StateError('Release Firebase project configuration is invalid.');
    }
  }

  static Uri requireTrustedPayMongoCheckout(String value) {
    final uri = Uri.tryParse(value);
    final host = uri?.host.toLowerCase() ?? '';
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.userInfo.isNotEmpty ||
        !(host == 'paymongo.com' || host.endsWith('.paymongo.com'))) {
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
