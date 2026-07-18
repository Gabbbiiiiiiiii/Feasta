import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../features/authentication/application/customer_auth_controller.dart';
import '../features/authentication/application/customer_auth_scope.dart';
import '../features/authentication/data/repositories/customer_auth_state_repository.dart';
import '../features/authentication/presentation/authentication_gate.dart';

class FeastaApp extends StatefulWidget {
  const FeastaApp({
    this.authenticationController,
    this.initialLocation = '/browse',
    super.key,
  });

  final CustomerAuthenticationController? authenticationController;
  final String initialLocation;

  @override
  State<FeastaApp> createState() => _FeastaAppState();
}

class _FeastaAppState extends State<FeastaApp> {
  late final CustomerAuthenticationController _controller;
  late final bool _ownsController;

  @override
  void initState() {
    super.initState();
    _ownsController = widget.authenticationController == null;
    _controller =
        widget.authenticationController ??
        CustomerAuthenticationController(
          repository: FirebaseCustomerAuthStateRepository(),
          initialLocation: widget.initialLocation,
        );
    _controller.start();
  }

  @override
  void dispose() {
    if (_ownsController) _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Feasta',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: CustomerAuthenticationScope(
        controller: _controller,
        child: AuthenticationGate(controller: _controller),
      ),
    );
  }
}
