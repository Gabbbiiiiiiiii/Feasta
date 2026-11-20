import {onAuthStateChanged} from "firebase/auth";
import {collection, doc, onSnapshot, query, Timestamp, where} from "firebase/firestore";
import {auth, db, initializeBrowserFirebase} from "@/lib/firebase/client";

/** Listen for scoped changes and let the server reload the authorized calendar projection. */
export function subscribeProviderCalendar(providerId: string, ownerId: string, month: string, refresh: () => void) {
  initializeBrowserFirebase();
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, -5, -8));
  const end = new Date(Date.UTC(year, monthNumber, 7, -8));
  let unsubscribe: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function queueRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  }

  const stopAuth = onAuthStateChanged(auth, (user) => {
    unsubscribe.forEach((stop) => stop());
    unsubscribe = [];
    clearTimeout(timer);
    if (user?.uid !== ownerId) return;
    // Private walk-in records stay on the server. Their mutations update this provider marker.
    unsubscribe.push(onSnapshot(doc(db, "providers", providerId), {includeMetadataChanges: true}, (snapshot) => {
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) queueRefresh();
    }, () => {}));
    unsubscribe.push(onSnapshot(query(collection(db, "providerRequests"),
      where("providerId", "==", providerId),
      where("eventDate", ">=", Timestamp.fromDate(start)),
      where("eventDate", "<", Timestamp.fromDate(end)),
    ), {includeMetadataChanges: true}, (snapshot) => {
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) queueRefresh();
    }, () => {}));
  });

  window.addEventListener("focus", queueRefresh);
  return () => {
    stopAuth();
    unsubscribe.forEach((stop) => stop());
    clearTimeout(timer);
    window.removeEventListener("focus", queueRefresh);
  };
}
