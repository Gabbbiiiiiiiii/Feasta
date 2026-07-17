export const FIRESTORE_COLLECTIONS = {
  users: "users",
  customers: "customers",
  providers: "providers",
  providerVerifications: "providerVerifications",

  packages: "packages",
  menuItems: "menuItems",
  addons: "addons",

  mainEvents: "mainEvents",
  providerRequests: "providerRequests",
  payments: "payments",

  chatRooms: "chatRooms",
  reviews: "reviews",
  favorites: "favorites",
  notifications: "notifications",

  complaints: "complaints",
  reports: "reports",
  adminLogs: "adminLogs",
  announcements: "announcements",

  bookingRecoveryOffers: "bookingRecoveryOffers",
  appSettings: "appSettings",
} as const;

export const FIRESTORE_SUBCOLLECTIONS = {
  timeline: "timeline",
  messages: "messages",
  documents: "documents",
  activity: "activity",
} as const;

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS];

export type FirestoreSubcollectionName =
  (typeof FIRESTORE_SUBCOLLECTIONS)[keyof typeof FIRESTORE_SUBCOLLECTIONS];