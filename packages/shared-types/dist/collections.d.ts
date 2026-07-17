export declare const FIRESTORE_COLLECTIONS: {
    readonly users: "users";
    readonly customers: "customers";
    readonly providers: "providers";
    readonly providerVerifications: "providerVerifications";
    readonly packages: "packages";
    readonly menuItems: "menuItems";
    readonly addons: "addons";
    readonly mainEvents: "mainEvents";
    readonly providerRequests: "providerRequests";
    readonly payments: "payments";
    readonly chatRooms: "chatRooms";
    readonly reviews: "reviews";
    readonly favorites: "favorites";
    readonly notifications: "notifications";
    readonly complaints: "complaints";
    readonly reports: "reports";
    readonly adminLogs: "adminLogs";
    readonly announcements: "announcements";
    readonly bookingRecoveryOffers: "bookingRecoveryOffers";
    readonly appSettings: "appSettings";
};
export declare const FIRESTORE_SUBCOLLECTIONS: {
    readonly timeline: "timeline";
    readonly messages: "messages";
    readonly documents: "documents";
    readonly activity: "activity";
};
export type FirestoreCollectionName = (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS];
export type FirestoreSubcollectionName = (typeof FIRESTORE_SUBCOLLECTIONS)[keyof typeof FIRESTORE_SUBCOLLECTIONS];
//# sourceMappingURL=collections.d.ts.map