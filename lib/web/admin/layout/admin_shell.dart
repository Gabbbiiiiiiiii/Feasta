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

    final scaffoldState = Scaffold.maybeOf(context);

    if (scaffoldState?.isDrawerOpen ?? false) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Lowered slightly so normal laptop widths still use the sidebar.
        final isCompact = constraints.maxWidth < 760;

        return Scaffold(
          backgroundColor: const Color(0xFFF8F9FB),

          // Only create an AppBar on genuinely small screens.
          appBar: isCompact
              ? AppBar(
                  toolbarHeight: 64,
                  automaticallyImplyLeading: false,
                  elevation: 0,
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF111827),
                  surfaceTintColor: Colors.transparent,
                  titleSpacing: 12,
                  title: Align(
                    alignment: Alignment.centerLeft,
                    child: IconButton(
                      tooltip: 'Open navigation',
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0xFFF8F9FB),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: () {
                        Scaffold.of(context).openDrawer();
                      },
                      icon: const Icon(Icons.menu_rounded),
                    ),
                  ),
                )
              : null,

          drawer: isCompact
              ? Drawer(
                  width: 280,
                  backgroundColor: Colors.transparent,
                  elevation: 0,
                  child: AdminSidebar(
                    currentRoute: _currentRoute,
                    onNavigate: _navigate,
                  ),
                )
              : null,

          body: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!isCompact)
                AdminSidebar(
                  currentRoute: _currentRoute,
                  onNavigate: _navigate,
                  compact: true,
                ),

              Expanded(
                child: Align(
                  alignment: Alignment.topLeft,
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(
                      isCompact ? 16 : 28,
                      24,
                      isCompact ? 16 : 28,
                      28,
                    ),
                    child: SizedBox(
                      width: double.infinity,
                      child: AdminRouter.buildPage(_currentRoute),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}