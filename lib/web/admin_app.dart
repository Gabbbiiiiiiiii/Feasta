import 'package:flutter/material.dart';

import 'auth/admin_auth_gate.dart';
import 'theme/admin_theme.dart';

class FeastaAdminApp extends StatelessWidget {
  const FeastaAdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Feasta Admin',
      debugShowCheckedModeBanner: false,
      theme: FeastaAdminTheme.lightTheme,
      home: const AdminAuthGate(),
    );
  }
}
