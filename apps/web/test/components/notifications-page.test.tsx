import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {FeastaNotification} from "@/lib/notifications/notification-types";

const adminNotificationActionMocks =
  vi.hoisted(() => ({
    loadPage: vi.fn(),
    loadMenu: vi.fn(),
    markOneRead: vi.fn(),
    markManyRead: vi.fn(),
  }));

vi.mock(
  "@/app/admin/notifications/actions",
  () => ({
    loadAdminNotificationsAction:
      adminNotificationActionMocks.loadPage,

    loadAdminNotificationMenuAction:
      adminNotificationActionMocks.loadMenu,

    markAdminNotificationReadAction:
      adminNotificationActionMocks.markOneRead,

    markAdminNotificationsReadAction:
      adminNotificationActionMocks.markManyRead,
  }),
);

const mocks = vi.hoisted(() => ({
  markOneRead: vi.fn(),
  markVisibleRead: vi.fn(),
  subscribeMenu: vi.fn(),
  subscribePage: vi.fn(),
  unsubscribe: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: navigationMocks.push}),
}));

vi.mock("@/lib/notifications/notification-client", () => ({
  markNotificationRead: mocks.markOneRead,
  markRecentNotificationsRead: mocks.markVisibleRead,
  subscribeToNotifications: mocks.subscribeMenu,
  subscribeToNotificationPage: mocks.subscribePage,
}));

import {NotificationMenu} from "@/components/layout/notification-menu";
import {NotificationsPageClient} from "@/components/notifications/notifications-page-client";
import {resolveCustomerNotificationDestination} from "@/lib/customer/notifications/customer-notification-destination";
import {resolveNotificationDestination} from "@/lib/notifications/notification-destination";

describe("notifications page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    adminNotificationActionMocks.loadPage
      .mockResolvedValue({
        notifications: [],
        requestedLimit: 20,
        hasMore: false,
      });

    adminNotificationActionMocks.loadMenu
      .mockResolvedValue({
        notifications: [],
        unreadCount: 0,
        unreadCountCapped: false,
      });

    adminNotificationActionMocks.markOneRead
      .mockResolvedValue({
        updated: true,
      });

    adminNotificationActionMocks.markManyRead
      .mockResolvedValue({
        updatedCount: 1,
      });
    mocks.markOneRead.mockResolvedValue(undefined);
    mocks.markVisibleRead.mockResolvedValue(undefined);
    mocks.subscribeMenu.mockImplementation(async (
      onValue: (snapshot: {
        notifications: readonly FeastaNotification[];
        unreadCount: number;
        unreadCountCapped: boolean;
      }) => void,
    ) => {
      onValue({
        notifications: [],
        unreadCount: 0,
        unreadCountCapped: false,
      });
      return {unsubscribe: mocks.unsubscribe};
    });
    mocks.subscribePage.mockImplementation(async (
      _requestedLimit: number,
      onValue: (items: FeastaNotification[]) => void,
    ) => {
      onValue([]);
      return {unsubscribe: mocks.unsubscribe};
    });
  });

  it("uses the same provider message destination in the dropdown and full page", async () => {
    const notification = notificationFixture({title: "New Message", type: "new_message", relatedCollection: "chatRooms", relatedId: "room_B-123"});
    mocks.subscribeMenu.mockImplementationOnce(async (onValue) => {
      onValue({notifications: [notification], unreadCount: 1, unreadCountCapped: false});
      return {unsubscribe: mocks.unsubscribe};
    });
    mocks.subscribePage.mockImplementationOnce(async (_limit, onValue) => {
      onValue([notification]);
      return {unsubscribe: mocks.unsubscribe};
    });
    const user = userEvent.setup();
    const view = render(<NotificationMenu role="provider" />);
    await user.click(await screen.findByRole("button", {name: "1 unread notifications"}));
    await user.click(screen.getByRole("button", {name: /New Message/}));
    expect(navigationMocks.push).toHaveBeenCalledWith("/provider/messages?room=room_B-123");
    expect(screen.queryByRole("dialog", {name: "Notifications"})).not.toBeInTheDocument();
    view.unmount();
    render(<NotificationsPageClient role="provider" />);
    expect(await screen.findByRole("link", {name: /New Message/})).toHaveAttribute("href", navigationMocks.push.mock.calls[0]![0]);
  });

  it.each(["customer", "provider"] as const)("rejects unsupported dropdown collections for %s", async (role) => {
    mocks.subscribeMenu.mockImplementationOnce(async (onValue) => {
      onValue({notifications: [notificationFixture({title: "Unsupported message", type: "new_message", relatedCollection: "unknownRooms", relatedId: "room_B"})], unreadCount: 1, unreadCountCapped: false});
      return {unsubscribe: mocks.unsubscribe};
    });
    const user = userEvent.setup();
    render(<NotificationMenu role={role} />);
    await user.click(await screen.findByRole("button", {name: "1 unread notifications"}));
    await user.click(screen.getByRole("button", {name: /Unsupported message/}));
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });

  it("renders an honest empty state from the bounded admin action", async () => {
    render(<NotificationsPageClient role="admin" />);

    expect(
      await screen.findByRole("heading", {
        name: "You’re all caught up",
      }),
    ).toBeInTheDocument();

  await waitFor(() => {
    expect(
          adminNotificationActionMocks.loadPage,
        ).toHaveBeenCalledWith(20);
      });

    expect(
      mocks.subscribePage,
    ).not.toHaveBeenCalled();
  });

  it(
    "does not navigate notifications with an unknown related collection",
    async () => {
      adminNotificationActionMocks.loadPage
        .mockResolvedValueOnce({
          notifications: [
            {
              id: "notification-1",
              userId: "admin-1",
              title:
                "Payment confirmed",
              message:
                "A customer payment was confirmed.",
              type: "payment",
              relatedId: "payment-1",
              relatedCollection:
                "unknownCollection",
              isRead: false,
              readAt: null,
              createdAt:
                "2026-08-01T12:00:00.000Z",
            },
          ],
          requestedLimit: 20,
          hasMore: false,
        });

      render(
        <NotificationsPageClient
          role="admin"
        />,
      );

      const notificationLink =
        await screen.findByRole(
          "link",
          {
            name:
              /payment confirmed/i,
          },
        );

      expect(
        notificationLink,
      ).toHaveAttribute(
        "href",
        "/admin/notifications",
      );
    },
  );

  it("marks only the currently visible unread notifications", async () => {
    const user = userEvent.setup();
    const unread = notificationFixture({id: "unread", title: "Unread update"});
    const read = notificationFixture({id: "read", title: "Read update", isRead: true});

    mocks.subscribePage.mockImplementation(async (
      _requestedLimit: number,
      onValue: (items: FeastaNotification[]) => void,
    ) => {
      onValue([unread, read]);
      return {unsubscribe: mocks.unsubscribe};
    });

    render(<NotificationsPageClient role="provider" />);
    await user.click(
      await screen.findByRole("button", {
        name: "Mark visible as read",
      }),
    );

    await waitFor(() => {
      expect(mocks.markVisibleRead).toHaveBeenCalledWith([unread]);
    });
  });

  it("increases the bounded subscription in page-size steps", async () => {
    const user = userEvent.setup();
    mocks.subscribePage.mockImplementation(async (
      requestedLimit: number,
      onValue: (items: FeastaNotification[]) => void,
    ) => {
      onValue(
        Array.from({length: requestedLimit}, (_, index) =>
          notificationFixture({
            id: `notification-${index}`,
            title: `Update ${index + 1}`,
            isRead: true,
          }),
        ),
      );
      return {unsubscribe: mocks.unsubscribe};
    });

    render(<NotificationsPageClient role="customer" />);

    await user.click(
      await screen.findByRole("button", {
        name: "Load 20 more",
      }),
    );

    await waitFor(() => {
      expect(mocks.subscribePage).toHaveBeenLastCalledWith(
        40,
        expect.any(Function),
        expect.any(Function),
      );
    });
  });

  it("does not trust arbitrary destinations from notification metadata", async () => {
    mocks.subscribePage.mockImplementation(async (
      _requestedLimit: number,
      onValue: (items: FeastaNotification[]) => void,
    ) => {
      onValue([
        notificationFixture({
          id: "unknown",
          title: "General update",
          type: "information",
          relatedCollection: "unknownCollection",
        }),
      ]);
      return {unsubscribe: mocks.unsubscribe};
    });

    render(<NotificationsPageClient role="customer" />);

    expect(
      await screen.findByRole("button", {
        name: /general update/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: /general update/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("routes provider message notifications through the server-validated room deep link", async () => {
    mocks.subscribePage.mockImplementation(async (
      _requestedLimit: number,
      onValue: (items: FeastaNotification[]) => void,
    ) => {
      onValue([
        notificationFixture({
          id: "message-notification",
          title: "New Message",
          type: "new_message",
          relatedCollection: "chatRooms",
          relatedId: "provider_request_123",
        }),
      ]);
      return {unsubscribe: mocks.unsubscribe};
    });

    render(<NotificationsPageClient role="provider" />);

    expect(await screen.findByRole("link", {name: /new message/i}))
      .toHaveAttribute(
        "href",
        "/provider/messages?room=provider_request_123",
      );
  });

  it("routes customer message notifications through the authorized customer room deep link", async () => {
    mocks.subscribePage.mockImplementation(async (
      _requestedLimit: number,
      onValue: (items: FeastaNotification[]) => void,
    ) => {
      onValue([
        notificationFixture({
          id: "customer-message-notification",
          title: "Provider replied",
          type: "new_message",
          relatedCollection: "chatRooms",
          relatedId: "provider_request_customer_123",
        }),
      ]);
      return {unsubscribe: mocks.unsubscribe};
    });

    render(<NotificationsPageClient role="customer" />);

    const notificationLink = await screen.findByRole("link", {
      name: /provider replied/i,
    });
    expect(notificationLink).toHaveAttribute(
      "href",
      "/customer/messages?room=provider_request_customer_123",
    );

    notificationLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(notificationLink);
    await waitFor(() => expect(mocks.markOneRead).toHaveBeenCalledWith(
      "customer-message-notification",
    ));
    expect(screen.getByText("No unread updates in this list")).toBeVisible();
  });

  it("uses the same message destination in the customer dropdown, closes it, and updates unread", async () => {
    const messageNotification = notificationFixture({
      id: "dropdown-message",
      title: "Provider sent a message",
      type: "new_message",
      relatedCollection: "chatRooms",
      relatedId: "provider_request_customer_456",
    });
    const otherNotification = notificationFixture({
      id: "other-notification",
      title: "Another update",
      type: "general",
      relatedCollection: null,
      relatedId: null,
    });
    mocks.subscribeMenu.mockImplementationOnce(async (
      onValue: (snapshot: {
        notifications: readonly FeastaNotification[];
        unreadCount: number;
        unreadCountCapped: boolean;
      }) => void,
    ) => {
      onValue({
        notifications: [messageNotification, otherNotification],
        unreadCount: 2,
        unreadCountCapped: false,
      });
      return {unsubscribe: mocks.unsubscribe};
    });

    const user = userEvent.setup();
    render(<NotificationMenu role="customer" />);
    await user.click(await screen.findByRole("button", {
      name: "2 unread notifications",
    }));
    await user.click(screen.getByRole("button", {
      name: /Provider sent a message/iu,
    }));

    expect(navigationMocks.push).toHaveBeenCalledWith(
      "/customer/messages?room=provider_request_customer_456",
    );
    await waitFor(() => expect(mocks.markOneRead).toHaveBeenCalledWith(
      "dropdown-message",
    ));
    expect(screen.queryByRole("dialog", {name: "Notifications"}))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "1 unread notifications"}))
      .toBeVisible();
  });

  it.each(["customer", "provider"] as const)("does not navigate the %s dropdown for malformed message metadata", async (role) => {
    mocks.subscribeMenu.mockImplementationOnce(async (
      onValue: (snapshot: {
        notifications: readonly FeastaNotification[];
        unreadCount: number;
        unreadCountCapped: boolean;
      }) => void,
    ) => {
      onValue({
        notifications: [notificationFixture({
          id: "unsafe-message",
          title: "Unsafe message",
          type: "new_message",
          relatedCollection: "chatRooms",
          relatedId: "../../admin",
        })],
        unreadCount: 1,
        unreadCountCapped: false,
      });
      return {unsubscribe: mocks.unsubscribe};
    });

    const user = userEvent.setup();
    render(<NotificationMenu role={role} />);
    await user.click(await screen.findByRole("button", {
      name: "1 unread notifications",
    }));
    await user.click(screen.getByRole("button", {name: /Unsafe message/iu}));

    expect(navigationMocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", {name: "Notifications"})).toBeVisible();
    await waitFor(() => expect(mocks.markOneRead).toHaveBeenCalledWith(
      "unsafe-message",
    ));
  });

  it("links generic customer notifications only to the safe notifications fallback", async () => {
    mocks.subscribePage.mockImplementationOnce(async (
      _requestedLimit: number,
      onValue: (items: FeastaNotification[]) => void,
    ) => {
      onValue([notificationFixture({
        title: "System update",
        type: "system",
        relatedCollection: null,
        relatedId: null,
      })]);
      return {unsubscribe: mocks.unsubscribe};
    });

    render(<NotificationsPageClient role="customer" />);

    expect(await screen.findByRole("link", {name: /System update/iu}))
      .toHaveAttribute("href", "/customer/notifications");
  });
});

describe("notification destination resolver", () => {
  it("preserves customer destinations and existing provider/admin fallbacks", () => {
    for (const [type, relatedCollection, relatedId] of [
      ["new_message", "chatRooms", "room_1"], ["booking", "mainEvents", "event_1"],
      ["payment", "payments", "payment_1"], ["review", "reviews", "review_1"],
      ["account", "users", "user_1"], ["system", null, null],
      ["new_message", "chatRooms", "../unsafe"],
    ]) {
      const notification = notificationFixture({type: type!, relatedCollection, relatedId});
      expect(resolveNotificationDestination("customer", notification)).toBe(resolveCustomerNotificationDestination(notification));
    }
    expect(resolveNotificationDestination("provider", notificationFixture({type: "verification", relatedCollection: "providerVerifications"}))).toBe("/provider/verification");
    expect(resolveNotificationDestination("admin", notificationFixture({type: "payment", relatedCollection: "payments"}))).toBe("/admin/payments");
    expect(resolveNotificationDestination("admin", notificationFixture({relatedCollection: "unknown"}))).toBe("/admin/notifications");
  });
  it.each([
  [
    "new booking request",
    {
      type: "new_booking_request",
      relatedCollection: "providerRequests",
      relatedId: "request_123",
    },
    "/provider/requests",
  ],
  [
    "provider request",
    {
      type: "booking_request",
      relatedCollection: "bookingProviderRequests",
      relatedId: "request_456",
    },
    "/provider/requests",
  ],
  [
    "booking",
    {
      type: "booking_confirmed",
      relatedCollection: "mainEvents",
      relatedId: "booking_123",
    },
    "/provider/bookings",
  ],
  [
    "payment",
    {
      type: "payment_confirmed",
      relatedCollection: "payments",
      relatedId: "payment_123",
    },
    "/provider/payments",
  ],
  [
    "refund",
    {
      type: "refund_completed",
      relatedCollection: "payments",
      relatedId: "payment_456",
    },
    "/provider/payments",
  ],
  [
    "review",
    {
      type: "review",
      relatedCollection: "reviews",
      relatedId: "review_123",
    },
    "/provider/reviews",
  ],
  [
    "verification",
    {
      type: "verification_updated",
      relatedCollection: "providerVerifications",
      relatedId: "verification_123",
    },
    "/provider/verification",
  ],
  [
    "message",
    {
      type: "new_message",
      relatedCollection: "chatRooms",
      relatedId: "room_123",
    },
    "/provider/messages?room=room_123",
  ],
] as const)(
  "routes provider %s notifications to the correct workspace",
  (_label, input, expected) => {
    expect(
      resolveNotificationDestination(
        "provider",
        notificationFixture(input),
      ),
    ).toBe(expected);
  },
);
  it("allowlists implemented Customer routes from matching type and collection metadata", () => {
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "new_message",
      relatedCollection: "chatRooms",
      relatedId: "room_123",
    }))).toBe("/customer/messages?room=room_123");
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "booking",
      relatedCollection: "mainEvents",
      relatedId: "main_event_123",
    }))).toBe("/customer/bookings/main_event_123");
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "booking",
      relatedCollection: "providerRequests",
      relatedId: "provider_request_123",
    }))).toBe("/customer/bookings");
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "payment",
      relatedCollection: "payments",
      relatedId: "payment_123",
    }))).toBe("/customer/payments");
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "review",
      relatedCollection: "reviews",
      relatedId: "review_123",
    }))).toBe("/customer/bookings");
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "account",
      relatedCollection: "users",
      relatedId: "customer_123",
    }))).toBe("/customer/account");
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "information",
      relatedCollection: null,
      relatedId: null,
    }))).toBe("/customer/notifications");
  });

  it("rejects malformed, mismatched, arbitrary, and cross-role destinations", () => {
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "new_message",
      relatedCollection: "chatRooms",
      relatedId: "javascript:alert(1)",
    }))).toBeNull();
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "new_message",
      relatedCollection: "providerRequests",
      relatedId: "provider_request_123",
    }))).toBeNull();
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "booking",
      relatedCollection: "bookings",
      relatedId: "booking_123",
    }))).toBeNull();
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "booking",
      relatedCollection: "bookingProviderRequests",
      relatedId: "provider_request_123",
    }))).toBeNull();

    const notificationWithUntrustedUrls = {
      ...notificationFixture({
        type: "new_message",
        relatedCollection: "chatRooms",
        relatedId: "room_456",
      }),
      href: "/admin/users",
      url: "https://example.test/phishing",
    };
    const destination = resolveCustomerNotificationDestination(
      notificationWithUntrustedUrls,
    );
    expect(destination).toBe("/customer/messages?room=room_456");
    expect(destination).not.toMatch(/^https?:|^javascript:|^\/admin|^\/provider/u);
    expect(resolveCustomerNotificationDestination(notificationFixture({
      type: "admin_booking",
      relatedCollection: "mainEvents",
      relatedId: "main_event_123",
    }))).toBeNull();
  });
});

function notificationFixture(
  overrides: Partial<FeastaNotification> = {},
): FeastaNotification {
  return {
    id: "notification-1",
    userId: "user-1",
    title: "Booking update",
    message: "Your booking status changed.",
    type: "booking",
    relatedId: "booking-1",
    relatedCollection: "mainEvents",
    isRead: false,
    readAt: null,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    ...overrides,
  };
}
