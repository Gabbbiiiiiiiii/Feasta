import 'package:flutter/material.dart';
import '../../../shared/models/customer_event_list.dart';
import '../../../shared/models/feasta_models.dart';
import 'event_list_controller.dart';
import 'event_list_navigation.dart';
import 'guest_event_list_panel.dart';
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
    // Planning is allowed for a real signed-out guest.
    // A signed-in but unauthorized account must not use guest storage.
    if (displayedSession.customerUid == null && !controller.isGuestPlanning) {
      setState(() {
        _feedbackSession = displayedSession;
        _message = 'Please sign in with an eligible customer account.';
      });
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
              ? null
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
    return AnimatedBuilder(
      animation: Listenable.merge([controller, controller.authentication]),
      builder: (context, _) {
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
              style: OutlinedButton.styleFrom(
                backgroundColor: saved ? const Color(0xFFE5F3EA) : null,
                foregroundColor: saved ? const Color(0xFF075238) : null,
                side: BorderSide(
                  color: saved
                      ? const Color(0xFF0B6546)
                      : Theme.of(context).colorScheme.outlineVariant,
                  width: saved ? 1.5 : 1,
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 18,
                ),
              ),
              onPressed: _busy ? null : () => _save(controller, session),
              icon: AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                child: Icon(
                  saved
                      ? Icons.check_circle_rounded
                      : Icons.playlist_add_rounded,
                  key: ValueKey<bool>(saved),
                  color: saved
                      ? const Color(0xFF075238)
                      : Theme.of(context).colorScheme.onSurface,
                ),
              ),
              label: Text(
                _busy
                    ? 'Saving package…'
                    : saved
                    ? 'Added to List'
                    : 'Add to List',
              ),
            ),
            if (saved)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Saved in your Event List',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF075238),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            if (_message != null &&
                _feedbackSession == controller.authentication.session)
              Semantics(liveRegion: true, child: Text(_message!)),
            TextButton(
              onPressed: () async {
                if (controller.isGuestPlanning) {
                  final result = await controller.load();
                  if (!context.mounted || !controller.isGuestPlanning) return;

                  if (result != EventListResult.loaded) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(eventListMessage(result))),
                    );
                    return;
                  }

                  await showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    builder: (_) => GuestEventListPanel(
                      controller: controller,
                      session: controller.authentication.session,
                    ),
                  );
                  return;
                }

                await openCustomerEventList(context);
              },
              child: const Text('View Event List'),
            ),
            const Text(
              'Planning selection only. No reservation or availability guarantee.',
            ),
          ],
        );
      },
    );
  }
}
