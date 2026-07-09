import 'package:flutter/material.dart';

import '../../admin/router/app_router.dart';
import 'admin_sidebar.dart';

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
      backgroundColor: const Color(0xFFF8F9FB),
      appBar: isCompact
          ? PreferredSize(
              preferredSize: const Size.fromHeight(72),
              child: AppBar(
                automaticallyImplyLeading: false,
                elevation: 0,
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF111827),
                titleSpacing: 0,
                title: Padding(
                  padding: const EdgeInsets.only(left: 12),
                  child: IconButton(
                    style: IconButton.styleFrom(
                      backgroundColor: const Color(0xFFF8F9FB),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    onPressed: () {
                      Scaffold.of(context).openDrawer();
                    },
                    icon: const Icon(Icons.menu_rounded),
                  ),
                ),
              ),
            )
          : null,
      drawer: isCompact
          ? Drawer(
              backgroundColor: Colors.transparent,
              elevation: 0,
              child: AdminSidebar(
                currentRoute: _currentRoute,
                onNavigate: _navigate,
              ),
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
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
              child: SingleChildScrollView(
                child: AdminRouter.buildPage(_currentRoute),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
