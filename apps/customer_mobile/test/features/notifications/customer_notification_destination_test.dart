import 'package:feasta/features/notifications/customer_notification_destination.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('routes special request notifications like web customer', () {
    final destination = resolveCustomerNotificationDestination(
      type: 'special_request',
      relatedCollection: 'specialRequests',
      relatedId: 'request_123',
    );
    expect(
      destination?.kind,
      CustomerNotificationDestinationKind.specialRequest,
    );
    expect(destination?.relatedId, 'request_123');
  });

  test(
    'allowlists implemented customer destinations from type and collection',
    () {
      expect(
        resolveCustomerNotificationDestination(
          type: 'new_message',
          relatedCollection: 'chatRooms',
          relatedId: 'room_123',
        )?.kind,
        CustomerNotificationDestinationKind.chatRoom,
      );
      expect(
        resolveCustomerNotificationDestination(
          type: 'booking',
          relatedCollection: 'mainEvents',
          relatedId: 'main_event_123',
        )?.kind,
        CustomerNotificationDestinationKind.bookingDetail,
      );
      expect(
        resolveCustomerNotificationDestination(
          type: 'booking',
          relatedCollection: 'providerRequests',
          relatedId: 'provider_request_123',
        )?.kind,
        CustomerNotificationDestinationKind.bookingsList,
      );
      expect(
        resolveCustomerNotificationDestination(
          type: 'payment',
          relatedCollection: 'payments',
          relatedId: 'payment_123',
        )?.kind,
        CustomerNotificationDestinationKind.bookingsList,
      );
      expect(
        resolveCustomerNotificationDestination(
          type: 'review',
          relatedCollection: 'reviews',
          relatedId: 'review_123',
        )?.kind,
        CustomerNotificationDestinationKind.bookingsList,
      );
      expect(
        resolveCustomerNotificationDestination(
          type: 'account',
          relatedCollection: 'users',
          relatedId: 'customer_123',
        )?.kind,
        CustomerNotificationDestinationKind.account,
      );
      expect(
        resolveCustomerNotificationDestination(
          type: 'information',
          relatedCollection: null,
          relatedId: null,
        )?.kind,
        CustomerNotificationDestinationKind.notifications,
      );
    },
  );

  test('rejects malformed, mismatched, and untrusted destinations', () {
    expect(
      resolveCustomerNotificationDestination(
        type: 'new_message',
        relatedCollection: 'chatRooms',
        relatedId: 'javascript:alert(1)',
      ),
      isNull,
    );
    expect(
      resolveCustomerNotificationDestination(
        type: 'new_message',
        relatedCollection: 'providerRequests',
        relatedId: 'provider_request_123',
      ),
      isNull,
    );
    expect(
      resolveCustomerNotificationDestination(
        type: 'booking',
        relatedCollection: 'bookings',
        relatedId: 'booking_123',
      ),
      isNull,
    );
    expect(
      resolveCustomerNotificationDestination(
        type: 'special_request',
        relatedCollection: 'mainEvents',
        relatedId: 'main_event_123',
      ),
      isNull,
    );
    expect(
      resolveCustomerNotificationDestination(
        type: 'admin_booking',
        relatedCollection: 'mainEvents',
        relatedId: 'main_event_123',
      ),
      isNull,
    );
  });

  test('keeps the mobile add-on request deep link', () {
    final destination = resolveCustomerNotificationDestination(
      type: 'system',
      relatedCollection: 'addonRequests',
      relatedId: 'addon_request_1',
    );
    expect(destination?.kind, CustomerNotificationDestinationKind.addonRequest);
    expect(destination?.relatedId, 'addon_request_1');
  });
}
