import 'package:flutter/material.dart';
import '../../../core/helpers/auth_guard.dart';
import '../../../shared/models/customer_event_list.dart';
import '../../../shared/models/feasta_models.dart';
import 'event_list_controller.dart';
import 'event_list_navigation.dart';
import 'event_list_scope.dart';

class SavePackageToEventList extends StatefulWidget {
  const SavePackageToEventList({
    required this.provider,
    required this.eventPackage,
    super.key,
  });
  final ProviderModel provider;
  final PackageModel eventPackage;
  @override
  State<SavePackageToEventList> createState() => _SavePackageToEventListState();
}

class _SavePackageToEventListState extends State<SavePackageToEventList> {
  bool _busy = false;
  String? _message;
  EventListAuthSession? _feedbackSession;
  Future<void> _save(
    EventListController controller,
    EventListAuthSession displayedSession,
  ) async {
    if (_busy || displayedSession != controller.authentication.session) return;
    if (controller.authentication.session.customerUid == null) {
      setState(() => _busy = true);
      try {
        await requireLogin(
          context,
          message:
              'Log in to save packages to your Event List. Return to the package and tap Add to Event List after login.',
        );
      } finally {
        if (mounted) setState(() => _busy = false);
      }
      return;
    }
    final session = controller.authentication.session;
    setState(() {
      _busy = true;
      _message = null;
      _feedbackSession = session;
    });
    try {
      final package = widget.eventPackage;
      if (package.providerId != widget.provider.id) {
        throw const FormatException();
      }
      final rawImage = package.imageUrl?.trim();
      final uri = rawImage == null ? null : Uri.tryParse(rawImage);
      final image =
          uri != null &&
              uri.scheme == 'https' &&
              uri.host.isNotEmpty &&
              uri.userInfo.isEmpty &&
              !uri.hasFragment &&
              !RegExp(r'\s').hasMatch(rawImage!) &&
              rawImage.length <= 2048
          ? rawImage
          : null;
      final entry = CustomerEventListEntry(
        providerId: widget.provider.id,
        packageId: package.id,
        packageName: package.name.trim(),
        providerName: widget.provider.businessName.trim(),
        estimatedPrice: package.price.isFinite && package.price >= 0
            ? package.price
            : null,
        imageUrl: image,
      );
      final result = await controller.addPackage(entry);
      if (mounted && session == controller.authentication.session) {
        setState(
          () => _message = result == EventListResult.saved
              ? 'Added to Event List'
              : eventListMessage(result),
        );
      }
    } on FormatException {
      if (mounted) {
        setState(
          () => _message =
              'This package has invalid details and could not be saved.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = EventListScope.maybeOf(context);
    if (controller == null) {
      return const Text('Event List unavailable. Please reopen the app.');
    }
    final session = controller.authentication.session;
    final package = widget.eventPackage;
    final saved =
        controller.list?.entries.any(
          (entry) =>
              entry.providerId == widget.provider.id &&
              entry.packageId == package.id,
        ) ??
        false;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(
          onPressed: _busy ? null : () => _save(controller, session),
          icon: const Icon(Icons.playlist_add, color: Colors.black87),
          label: Text(
            _busy
                ? 'Saving package…'
                : saved
                ? 'Added to Event List'
                : 'Add to Event List',
          ),
        ),
        if (_message != null &&
            _feedbackSession == controller.authentication.session)
          Semantics(liveRegion: true, child: Text(_message!)),
        TextButton(
          onPressed: () => openCustomerEventList(context),
          child: const Text('View Event List'),
        ),
        const Text(
          'Planning selection only. No reservation or availability guarantee.',
        ),
      ],
    );
  }
}
