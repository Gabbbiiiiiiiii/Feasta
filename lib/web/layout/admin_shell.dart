import 'package:flutter/material.dart';

import '../router/app_router.dart';
import 'admin_sidebar.dart';
import 'admin_top_bar.dart';

class AdminShell extends StatefulWidget {
  const AdminShell({super.key});

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  String _currentRoute = AdminRoute.dashboard;

  void _navigate(String route) {
    setState(() {
      _currentRoute = route;
    });
  }

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.of(context).size.width < 900;

    return Scaffold(
      backgroundColor: const Color(0xFFF6F7FB),
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(72),
        child: AdminTopBar(
          onMenuPressed: () {
            Scaffold.of(context).openDrawer();
          },
          currentRoute: _currentRoute,
          onNavigate: _navigate,
        ),
      ),
      drawer: isCompact
          ? AdminSidebar(
              currentRoute: _currentRoute,
              onNavigate: _navigate,
            )
          : null,
      body: Row(
        children: [
          if (!isCompact)
            AdminSidebar(
              currentRoute: _currentRoute,
              onNavigate: _navigate,
              compact: true,
            ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: AdminRouter.buildPage(_currentRoute),
            ),
          ),
        ],
      ),
    );
  }
}
