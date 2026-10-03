import 'package:flutter/widgets.dart';

import 'customer_auth_controller.dart';

class CustomerAuthenticationScope
    extends InheritedNotifier<CustomerAuthenticationController> {
  const CustomerAuthenticationScope({
    required CustomerAuthenticationController controller,
    required super.child,
    super.key,
  }) : super(notifier: controller);

  static CustomerAuthenticationController of(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<CustomerAuthenticationScope>();
    assert(scope != null, 'CustomerAuthenticationScope was not found.');
    return scope!.notifier!;
  }

  static CustomerAuthenticationController? maybeOf(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<CustomerAuthenticationScope>()
        ?.notifier;
  }
}
