import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  WithFieldValue,
} from "firebase-admin/firestore";

export function createConverter<
  T extends DocumentData,
>(
  fromFirestore: (
    data: DocumentData,
    id: string,
  ) => T,
): FirestoreDataConverter<T> {
  return {
    toFirestore(
      model: WithFieldValue<T>,
    ): DocumentData {
      return model;
    },

    fromFirestore(
      snapshot: QueryDocumentSnapshot<
        DocumentData,
        DocumentData
      >,
    ): T {
      const data = snapshot.data();

      return fromFirestore(
        data,
        snapshot.id,
      );
    },
  };
}