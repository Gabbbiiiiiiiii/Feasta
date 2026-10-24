import 'package:flutter/foundation.dart';
import '../../../core/helpers/booking_preparation.dart';
import '../../../core/helpers/provider_discovery.dart';
import '../../../shared/models/customer_event_list.dart';
import '../../../shared/models/feasta_models.dart';
import '../customization_session.dart';
import 'event_list_controller.dart';
import 'event_list_catalog.dart';

/// Holds one lock through verification and navigation's full route completion.
/// Never writes saved selections or creates booking attempts.
class EventListCustomizationController extends ChangeNotifier {
  EventListCustomizationController({
    required this.controller,
    required this.lookupPackage,
    required this.lookupProvider,
  }) {
    controller.addListener(_sync);
    controller.authentication.addListener(_sync);
  }
  final EventListController controller;
  final EventListPackageLookup lookupPackage;
  final Future<ProviderModel?> Function(String) lookupProvider;
  EventListAuthSession? _feedbackSession;
  Object? _operation;
  bool Function()? _validSelection;
  CustomizationSession? _session;
  bool _disposed = false;
  String? selectedKey;
  String? message;
  bool verifying = false;
  bool get busy => _operation != null;
  void _sync() {
    if (_feedbackSession != null &&
        _feedbackSession != controller.authentication.session) {
      invalidate();
      return;
    }
    if (_operation != null && !(_validSelection?.call() ?? false)) invalidate();
  }

  /// Mutation intent cancels before persistence, even if that mutation fails.
  void invalidate({EventListIdentity? identity}) {
    if (_disposed || (identity != null && selectedKey != identity.key)) return;
    _operation = null;
    _validSelection = null;
    _session?.close();
    _session = null;
    _feedbackSession = null;
    selectedKey = null;
    verifying = false;
    message = null;
    notifyListeners();
  }

  Future<void> customize(
    CustomerEventListEntry entry, {
    required bool Function() originIsCurrent,
    required Future<void> Function(
      ProviderModel,
      PackageModel,
      CustomizationSession,
    )
    navigate,
  }) async {
    if (_disposed || busy || !originIsCurrent()) return;
    final auth = controller.authentication.session;
    final list = controller.list;
    final key = entry.identity.key;
    if (auth.customerUid == null ||
        list == null ||
        list.ownerUid != auth.customerUid ||
        !list.entries.any((e) => e.identity.key == key)) {
      return;
    }
    final token = Object();
    bool selectionCurrent() =>
        !_disposed &&
        auth == controller.authentication.session &&
        controller.list?.ownerUid == list.ownerUid &&
        controller.list?.revision == list.revision &&
        (controller.list?.entries.any((e) => e.identity.key == key) ?? false);
    bool active() =>
        identical(_operation, token) && selectionCurrent() && originIsCurrent();
    _feedbackSession = auth;
    _operation = token;
    _validSelection = selectionCurrent;
    selectedKey = key;
    verifying = true;
    message = null;
    notifyListeners();
    CustomizationSession? binding;
    try {
      final package = await lookupPackage(entry.providerId, entry.packageId);
      if (!active()) return;
      if (package == null) {
        message =
            'This package is currently unavailable. Your saved selection has been kept.';
        return;
      }
      if (package.id != entry.packageId ||
          package.providerId != entry.providerId) {
        throw const FormatException('Unexpected package identity');
      }
      final provider = await lookupProvider(entry.providerId);
      if (!active()) return;
      if (provider == null || provider.id != entry.providerId) {
        throw const FormatException('Unexpected provider identity');
      }
      if (!eligiblePreparationPackage(package, entry.providerId) ||
          !isDiscoverableProvider(provider)) {
        message =
            'This package is currently unavailable. Your saved selection has been kept.';
        return;
      }
      if (!knownPreparationPrice(package.price)) {
        message =
            'The latest package price could not be verified. Please try again later.';
        return;
      }
      if (!active()) return;
      binding = CustomizationSession(
        uid: auth.customerUid!,
        generation: auth.generation,
        changes: controller.authentication,
        isCurrent: () => auth == controller.authentication.session,
      );
      _session = binding;
      verifying = false;
      notifyListeners();
      if (!active() || !binding.authorized) return;
      await navigate(provider, package, binding);
    } catch (_) {
      if (active()) {
        message = "We couldn't verify this package. Please try again.";
      }
    } finally {
      binding?.dispose();
      if (identical(_operation, token)) {
        final publish = selectionCurrent();
        _operation = null;
        _validSelection = null;
        _session = null;
        verifying = false;
        if (!publish || !originIsCurrent()) {
          message = null;
        }
        if (!_disposed) notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    invalidate();
    _disposed = true;
    controller.removeListener(_sync);
    controller.authentication.removeListener(_sync);
    super.dispose();
  }
}
