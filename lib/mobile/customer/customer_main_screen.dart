import 'package:flutter/material.dart';

import '../../core/helpers/auth_guard.dart';
import '../../core/services/device_permission_service.dart';
import 'customer_account_screen.dart';
import 'customer_bookings_screen.dart';
import 'customer_favorites_screen.dart';
import 'customer_home_screen.dart';
import 'customer_search_screen.dart';

class CustomerMainScreen extends StatefulWidget {
  const CustomerMainScreen({super.key});

  @override
  State<CustomerMainScreen> createState() => _CustomerMainScreenState();
}

class _CustomerMainScreenState extends State<CustomerMainScreen> {
  int selectedIndex = 0;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      DevicePermissionService.requestCorePermissionsIfNeeded(context);
    });
  }

  Future<void> _onTabTapped(int index) async {
    final protectedTab = index == 2 || index == 3 || index == 4;

    if (protectedTab) {
      final allowed = await requireLogin(
        context,
        message: 'Please log in or create an account to view this section.',
      );

      if (!allowed || !mounted) return;
    }

    setState(() {
      selectedIndex = index;
    });
  }

  Widget _buildScreen() {
    switch (selectedIndex) {
      case 1:
        return const CustomerSearchScreen();
      case 2:
        return const CustomerBookingsScreen();
      case 3:
        return const CustomerFavoritesScreen();
      case 4:
        return CustomerAccountScreen(
          onOpenTab: (index) {
            _onTabTapped(index);
          },
        );
      case 0:
      default:
        return const CustomerHomeScreen();
    }
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      body: _buildScreen(),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: selectedIndex,
        selectedItemColor: primary,
        unselectedItemColor: Colors.grey,
        type: BottomNavigationBarType.fixed,
        onTap: _onTabTapped,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.search),
            label: 'Search',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.calendar_month_outlined),
            activeIcon: Icon(Icons.calendar_month),
            label: 'Bookings',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.favorite_border),
            activeIcon: Icon(Icons.favorite),
            label: 'Favorites',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'Account',
          ),
        ],
      ),
    );
  }
}
