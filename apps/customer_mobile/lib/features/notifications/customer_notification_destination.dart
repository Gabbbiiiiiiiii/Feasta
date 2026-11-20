/// Resolves customer notification taps to trusted in-app destinations.
///
/// Mirrors apps/web/src/lib/customer/notifications/customer-notification-destination.ts.
/// Destinations are allowlisted from type + relatedCollection + relatedId only.
library;

final _safeDocumentId = RegExp(r'^[A-Za-z0-9_-]{1,160}$');

enum CustomerNotificationDestinationKind {
  specialRequest,
  chatRoom,
  bookingDetail,
  bookingsList,
  account,
  notifications,

  /// Mobile still supports the legacy add-on request payment/details path.
  addonRequest,
}

class CustomerNotificationDestination {
  const CustomerNotificationDestination(this.kind, {this.relatedId});

  final CustomerNotificationDestinationKind kind;
  final String? relatedId;
}

CustomerNotificationDestination? resolveCustomerNotificationDestination({
  required String? type,
  required String? relatedCollection,
  required String? relatedId,
}) {
  final normalizedType = (type ?? '').trim().toLowerCase();
  final collection = (relatedCollection ?? '').trim().toLowerCase();
  final id = _safeRelatedId(relatedId);

  if (normalizedType == 'special_request') {
    return collection == 'specialrequests' && id != null
        ? CustomerNotificationDestination(
            CustomerNotificationDestinationKind.specialRequest,
            relatedId: id,
          )
        : null;
  }

  if (normalizedType == 'new_message') {
    return collection == 'chatrooms' && id != null
        ? CustomerNotificationDestination(
            CustomerNotificationDestinationKind.chatRoom,
            relatedId: id,
          )
        : null;
  }

  if (normalizedType == 'booking') {
    if (collection == 'mainevents' && id != null) {
      return CustomerNotificationDestination(
        CustomerNotificationDestinationKind.bookingDetail,
        relatedId: id,
      );
    }
    if (collection == 'providerrequests' && id != null) {
      return const CustomerNotificationDestination(
        CustomerNotificationDestinationKind.bookingsList,
      );
    }
    return null;
  }

  if (normalizedType == 'payment') {
    // Mobile has no dedicated payments inbox; bookings is the trusted next step.
    return collection == 'payments' && id != null
        ? const CustomerNotificationDestination(
            CustomerNotificationDestinationKind.bookingsList,
          )
        : null;
  }

  if (normalizedType == 'review') {
    return collection == 'reviews' && id != null
        ? const CustomerNotificationDestination(
            CustomerNotificationDestinationKind.bookingsList,
          )
        : null;
  }

  if (normalizedType == 'account') {
    return collection == 'users' && id != null
        ? const CustomerNotificationDestination(
            CustomerNotificationDestinationKind.account,
          )
        : null;
  }

  if ([
        'announcement',
        'general',
        'information',
        'system',
      ].contains(normalizedType) &&
      collection.isEmpty) {
    return const CustomerNotificationDestination(
      CustomerNotificationDestinationKind.notifications,
    );
  }

  // Preserve the existing mobile add-on request deep link.
  if (collection == 'addonrequests' && id != null) {
    return CustomerNotificationDestination(
      CustomerNotificationDestinationKind.addonRequest,
      relatedId: id,
    );
  }

  return null;
}

String? _safeRelatedId(String? value) {
  final id = value?.trim();
  if (id == null || id.isEmpty || !_safeDocumentId.hasMatch(id)) {
    return null;
  }
  return id;
}
