import {render, screen, waitFor} from "@testing-library/react";
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
  subscribePage: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/notifications/notification-client", () => ({
  markNotificationRead: mocks.markOneRead,
  markRecentNotificationsRead: mocks.markVisibleRead,
  subscribeToNotificationPage: mocks.subscribePage,
}));

import {NotificationsPageClient} from "@/components/notifications/notifications-page-client";

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
    mocks.subscribePage.mockImplementation(async (
      _requestedLimit: number,
      onValue: (items: FeastaNotification[]) => void,
    ) => {
      onValue([]);
      return {unsubscribe: mocks.unsubscribe};
    });
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
