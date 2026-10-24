import 'package:flutter/material.dart';
import '../../../core/helpers/auth_guard.dart';
import 'customer_event_list_screen.dart';
import 'event_list_scope.dart';

Future<void> openCustomerEventList(BuildContext context) async {
  final controller = EventListScope.of(context);
  final navigator = Navigator.of(context);
  if (controller.authentication.session.customerUid == null) {
    final allowed = await requireLogin(
      context,
      message: 'Log in to view your customer Event List.',
    );
    if (!allowed) return;
  }
  if (!navigator.mounted ||
      controller.authentication.session.customerUid == null) {
    return;
  }
  await navigator.push(
    MaterialPageRoute<void>(builder: (_) => const CustomerEventListScreen()),
  );
}
