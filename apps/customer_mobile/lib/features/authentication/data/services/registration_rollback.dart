Future<T> createIdentityAndProfile<T>({
  required Future<T> Function() createIdentity,
  required Future<void> Function(T identity) createProfile,
  required Future<void> Function(T identity) rollbackIdentity,
  void Function(Object error, StackTrace stackTrace)? onProfileError,
  void Function(Object error, StackTrace stackTrace)? onRollbackError,
}) async {
  final identity = await createIdentity();

  try {
    await createProfile(identity);
    return identity;
  } catch (error, stackTrace) {
    onProfileError?.call(error, stackTrace);
    try {
      await rollbackIdentity(identity);
    } catch (rollbackError, rollbackStackTrace) {
      onRollbackError?.call(rollbackError, rollbackStackTrace);
    }
    rethrow;
  }
}
