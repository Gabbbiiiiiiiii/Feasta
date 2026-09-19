abstract final class FirestoreCollections {
  static const String users = 'users';
  static const String customers = 'customers';
  static const String providers = 'providers';
  static const String providerVerifications =
      'providerVerifications';

  static const String packages = 'packages';
  static const String menuItems = 'menuItems';
  static const String addons = 'addons';

  static const String mainEvents = 'mainEvents';
  static const String providerRequests = 'providerRequests';
  static const String payments = 'payments';

  static const String chatRooms = 'chatRooms';
  static const String reviews = 'reviews';
  static const String favorites = 'favorites';
  static const String notifications = 'notifications';

  static const String complaints = 'complaints';
  static const String reports = 'reports';
  static const String adminLogs = 'adminLogs';
  static const String announcements = 'announcements';

  static const String bookingRecoveryOffers =
      'bookingRecoveryOffers';

  static const String appSettings = 'appSettings';

  // Legacy collections still used by the current Flutter implementation.
  // Remove only after their data access has been migrated.

  @Deprecated(
    'Migrate to mainEvents.',
  )
  static const String bookings = 'bookings';

  @Deprecated(
    'Migrate to providerRequests.',
  )
  static const String bookingProviderRequests =
      'bookingProviderRequests';

  @Deprecated(
    'Migrate to mainEvents/{mainEventId}/timeline/{timelineId}.',
  )
  static const String bookingTimelines = 'bookingTimelines';

  @Deprecated(
    'Migrate to chatRooms/{chatRoomId}/messages/{messageId}.',
  )
  static const String messages = 'messages';

  @Deprecated(
    'Review and migrate this workflow during Phase 2.',
  )
  static const String addonRequests = 'addonRequests';
}