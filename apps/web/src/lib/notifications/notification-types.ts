export type FeastaNotification = {
  id: string;
  userId: string;

  title: string;
  message: string;
  type: string;

  relatedId: string | null;
  relatedCollection: string | null;

  isRead: boolean;
  readAt: Date | null;
  createdAt: Date | null;
};

export type NotificationSnapshot = {
  notifications: readonly FeastaNotification[];
  unreadCount: number;
  unreadCountCapped: boolean;
};

export const RECENT_NOTIFICATION_LIMIT = 8;
export const UNREAD_NOTIFICATION_LIMIT = 100;
export const NOTIFICATION_PAGE_SIZE = 20;
export const MAX_NOTIFICATION_PAGE_ITEMS = 100;