import '../../features/authentication/domain/auth_account_state.dart';

abstract final class CustomerAppLocations {
  static const startup = '/startup';
  static const browse = '/browse';
  static const login = '/login';
  static const verifyEmail = '/verify-email';
  static const customer = '/customer';
  static const bookings = '/bookings';
  static const favorites = '/favorites';
  static const account = '/account';
  static const booking = '/booking';
  static const unavailable = '/account-unavailable';
  static const profileRecovery = '/profile-recovery';
  static const roleNotSupported = '/role-not-supported';

  static const publicLocations = {browse, login};
  static const protectedLocations = {
    customer,
    bookings,
    favorites,
    account,
    booking,
  };
  static const knownLocations = {
    startup,
    verifyEmail,
    unavailable,
    profileRecovery,
    roleNotSupported,
    ...publicLocations,
    ...protectedLocations,
  };
}

abstract final class CustomerRouteGuard {
  static String? sanitizeIntendedLocation(Object? value) {
    if (value is! String || value.isEmpty || value.contains('\\')) return null;
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.hasScheme ||
        uri.hasAuthority ||
        uri.userInfo.isNotEmpty ||
        uri.query.isNotEmpty ||
        uri.fragment.isNotEmpty ||
        !value.startsWith('/') ||
        value.startsWith('//') ||
        value.contains('\r') ||
        value.contains('\n')) {
      return null;
    }
    return CustomerAppLocations.knownLocations.contains(uri.path)
        ? uri.path
        : null;
  }

  static String resolve({
    required AuthenticationGateKind gate,
    required String requestedLocation,
  }) {
    final requested =
        sanitizeIntendedLocation(requestedLocation) ??
        CustomerAppLocations.browse;

    return switch (gate) {
      AuthenticationGateKind.loading => CustomerAppLocations.startup,
      AuthenticationGateKind.unauthenticated =>
        CustomerAppLocations.publicLocations.contains(requested)
            ? requested
            : CustomerAppLocations.login,
      AuthenticationGateKind.emailVerificationRequired =>
        CustomerAppLocations.verifyEmail,
      AuthenticationGateKind.customerReady ||
      AuthenticationGateKind.customerPhoneVerificationRequired =>
        CustomerAppLocations.protectedLocations.contains(requested)
            ? requested
            : CustomerAppLocations.customer,
      AuthenticationGateKind.missingUserProfile =>
        CustomerAppLocations.profileRecovery,
      AuthenticationGateKind.blocked ||
      AuthenticationGateKind.deactivated ||
      AuthenticationGateKind.disabledAccount ||
      AuthenticationGateKind.disabledAuthAccount ||
      AuthenticationGateKind.invalidAccountState =>
        CustomerAppLocations.unavailable,
      AuthenticationGateKind.forbiddenRole ||
      AuthenticationGateKind.providerBusinessSetupRequired ||
      AuthenticationGateKind.providerVerificationDraft ||
      AuthenticationGateKind.providerVerificationSubmitted ||
      AuthenticationGateKind.providerUnderReview ||
      AuthenticationGateKind.providerResubmissionRequired ||
      AuthenticationGateKind.providerRejected ||
      AuthenticationGateKind.providerSuspended ||
      AuthenticationGateKind.providerApproved ||
      AuthenticationGateKind.adminReady =>
        CustomerAppLocations.roleNotSupported,
      AuthenticationGateKind.sessionExpired => CustomerAppLocations.login,
      AuthenticationGateKind.configurationError =>
        CustomerAppLocations.unavailable,
    };
  }
}
