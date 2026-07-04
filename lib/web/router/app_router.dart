import 'package:flutter/material.dart';

import '../admin/pages/bookings_page.dart';
import '../admin/pages/dashboard_page.dart';
import '../admin/pages/providers_page.dart';
import '../admin/pages/promotions_page.dart';
import '../admin/pages/reports_page.dart';
import '../admin/pages/settings_page.dart';
import '../admin/pages/users_page.dart';

class AdminRoute {
  AdminRoute._();

  static const String dashboard = '/dashboard';
  static const String users = '/users';
  static const String providers = '/providers';
  static const String bookings = '/bookings';
  static const String promotions = '/promotions';
  static const String reports = '/reports';
  static const String settings = '/settings';
}

class AdminRouter {
  static Widget buildPage(String route) {
    switch (route) {
      case AdminRoute.users:
        return const UsersPage();
      case AdminRoute.providers:
        return const ProvidersPage();
      case AdminRoute.bookings:
        return const BookingsPage();
      case AdminRoute.promotions:
        return const PromotionsPage();
      case AdminRoute.reports:
        return const ReportsPage();
      case AdminRoute.settings:
        return const SettingsPage();
      case AdminRoute.dashboard:
      default:
        return const DashboardPage();
    }
  }
}
