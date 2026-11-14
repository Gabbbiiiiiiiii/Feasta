/// Legacy mainEvents replacement cannot mint a canonical payment reservation.
const legacyBookingPaymentAuthorityMessage =
    'Recovery offers remain available to view. Selecting a replacement caterer '
    'is temporarily unavailable. Contact FEASTA support for help with recovery. '
    'Your existing booking and payment history are unchanged.';

Never requireTrustedLegacyBookingPaymentAuthority() {
  throw UnsupportedError(legacyBookingPaymentAuthorityMessage);
}
