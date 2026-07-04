import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

import '../../core/firestore/firestore_collections.dart';

class AdminStatistics {
  final int totalUsers;
  final int totalCustomers;
  final int totalProviders;

  final int totalBookings;
  final int pendingBookings;
  final int completedBookings;
  final int cancelledBookings;

  final double totalRevenue;

  AdminStatistics({
    required this.totalUsers,
    required this.totalCustomers,
    required this.totalProviders,
    required this.totalBookings,
    required this.pendingBookings,
    required this.completedBookings,
    required this.cancelledBookings,
    required this.totalRevenue,
  });

  factory AdminStatistics.empty() {
    return AdminStatistics(
      totalUsers: 0,
      totalCustomers: 0,
      totalProviders: 0,
      totalBookings: 0,
      pendingBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0,
      totalRevenue: 0,
    );
  }

  /// 🔥 REAL-TIME STREAM (FULL DYNAMIC)
  static Stream<AdminStatistics> stream() {
    final firestore = FirebaseFirestore.instance;

    final usersStream =
        firestore.collection(FirestoreCollections.users).snapshots();

    final customersStream =
        firestore.collection(FirestoreCollections.customers).snapshots();

    final providersStream =
        firestore.collection(FirestoreCollections.providers).snapshots();

    final bookingsStream =
        firestore.collection(FirestoreCollections.bookings).snapshots();

    return Rx.combineLatest4(
      usersStream,
      customersStream,
      providersStream,
      bookingsStream,
      (QuerySnapshot users,
          QuerySnapshot customers,
          QuerySnapshot providers,
          QuerySnapshot bookings) {
        int pending = 0;
        int completed = 0;
        int cancelled = 0;
        double revenue = 0;

        for (var doc in bookings.docs) {
          final data = doc.data() as Map<String, dynamic>;

          final status = (data['status'] ?? 'pending').toString();
          final price = (data['totalPrice'] ?? 0).toDouble();

          revenue += price;

          if (status == 'pending') pending++;
          if (status == 'completed') completed++;
          if (status == 'cancelled') cancelled++;
        }

        return AdminStatistics(
          totalUsers: users.size,
          totalCustomers: customers.size,
          totalProviders: providers.size,
          totalBookings: bookings.size,
          pendingBookings: pending,
          completedBookings: completed,
          cancelledBookings: cancelled,
          totalRevenue: revenue,
        );
      },
    );
  }
}