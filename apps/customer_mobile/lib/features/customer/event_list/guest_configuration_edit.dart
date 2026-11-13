import 'package:flutter/material.dart';
import '../../../shared/models/customer_event_list.dart';
import '../../authentication/data/repositories/feasta_repository.dart';
import '../event_customization_screen.dart';
import 'event_list_controller.dart';
import 'event_list_customization_controller.dart';

class GuestConfigurationEdit extends StatefulWidget {
  const GuestConfigurationEdit({
    required this.entry,
    required this.controller,
    super.key,
  });
  final CustomerEventListEntry entry;
  final EventListController controller;
  @override
  State<GuestConfigurationEdit> createState() => _GuestConfigurationEditState();
}

class _GuestConfigurationEditState extends State<GuestConfigurationEdit> {
  bool _busy = false;
  Future<void> _edit() async {
    if (_busy || !widget.controller.isGuestPlanning) return;
    final auth = widget.controller.authentication.session;
    final repository = FeastaRepository();
    final editor = EventListCustomizationController(
      controller: widget.controller,
      lookupPackage: repository.getEligiblePackageForPreparation,
      lookupProvider: repository.getProviderById,
    );
    setState(() => _busy = true);
    try {
      await editor.customize(
        widget.entry,
        originIsCurrent: () =>
            mounted &&
            widget.controller.isGuestPlanning &&
            auth == widget.controller.authentication.session &&
            (ModalRoute.of(context)?.isCurrent ?? true),
        navigate: (provider, package, binding) async {
          final route = EventCustomizationRoute(
            origin: ModalRoute.of(context),
            builder: (_) => EventCustomizationScreen(
              provider: provider,
              eventPackage: package,
              repository: repository,
              session: binding,
              initialConfiguration: widget.entry.configuration,
            ),
          );
          Navigator.of(context).push<void>(route);
          await route.completed;
        },
      );
      if (mounted &&
          editor.message != null &&
          widget.controller.isGuestPlanning &&
          auth == widget.controller.authentication.session) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(editor.message!)));
      }
    } finally {
      editor.dispose();
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => OutlinedButton(
    onPressed: _busy ? null : _edit,
    child: Text(
      _busy
          ? 'Checking current package…'
          : widget.entry.configuration == null
          ? 'Customize package'
          : 'Edit configuration',
    ),
  );
}
