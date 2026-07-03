import 'package:flutter/material.dart';

import '../../core/services/device_permission_service.dart';
import '../../models/feasta_models.dart';
import '../../repositories/auth_repository.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';
import '../auth/login_screen.dart';
import 'provider_booking_details_screen.dart';
import '../notifications/notifications_screen.dart';
import 'provider_packages_screen.dart';
import 'provider_addons_screen.dart';
import 'provider_menu_items_screen.dart';
import 'provider_addon_requests_screen.dart';
import 'provider_recovery_opportunities_screen.dart';
import 'provider_my_recovery_offers_screen.dart';
import '../../core/helpers/provider_category_helper.dart';

class ProviderDashboardScreen extends StatefulWidget {
  const ProviderDashboardScreen({super.key});

  @override
  State<ProviderDashboardScreen> createState() =>
      _ProviderDashboardScreenState();
}

class _ProviderDashboardScreenState extends State<ProviderDashboardScreen> {
  final FeastaRepository repository = FeastaRepository();
  final AuthRepository authRepository = AuthRepository();

  String selectedFilter = 'pending';

  final List<String> filters = [
    'pending',
    'waiting_payment',
    'confirmed',
    'completed',
    'rejected',
    'cancelled',
  ];

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      DevicePermissionService.requestCorePermissionsIfNeeded(
        context,
        requestLocation: false,
      );
    });
  }

  String statusLabel(String status) {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'waiting_payment':
        return 'Waiting Payment';
      case 'confirmed':
        return 'Confirmed';
      case 'completed':
        return 'Completed';
      case 'rejected':
        return 'Rejected';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }

  Color statusColor(String status) {
    switch (status) {
      case 'pending':
        return Colors.orange;
      case 'waiting_payment':
        return const Color(0xFFFF6333);
      case 'confirmed':
        return Colors.green;
      case 'completed':
        return Colors.blue;
      case 'rejected':
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Future<void> _logout() async {
    await authRepository.logout();

    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Provider Dashboard',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          StreamBuilder(
            stream: repository.myNotifications(),
            builder: (context, snapshot) {
              final docs = snapshot.data?.docs ?? [];
              final unreadCount = docs.where((doc) {
                final data = doc.data();
                return data['isRead'] != true;
              }).length;

              return SizedBox(
                width: 50,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    IconButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const NotificationsScreen(),
                          ),
                        );
                      },
                      icon: const Icon(Icons.notifications_outlined),
                    ),
                    if (unreadCount > 0)
                      Positioned(
                        right: 7,
                        top: 7,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 5,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: primary,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          constraints: const BoxConstraints(
                            minWidth: 18,
                            minHeight: 18,
                          ),
                          child: Center(
                            child: Text(
                              unreadCount > 9 ? '9+' : '$unreadCount',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
          IconButton(
            onPressed: _logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: Column(
        children: [
          FutureBuilder<ProviderModel?>(
            future: repository.getMyProviderProfile(),
            builder: (context, snapshot) {
              final provider = snapshot.data;

              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.all(16),
                  child: FeastaSkeletonPulse(
                    child: FeastaSkeletonBox(height: 116, radius: 22),
                  ),
                );
              }

              if (provider == null) {
                return Container(
                  width: double.infinity,
                  margin: const EdgeInsets.all(16),
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.orange.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.orange),
                  ),
                  child: const Text(
                    'Provider profile not found. Make sure this account was registered as a provider.',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                );
              }

              final isCateringProvider = provider.providerServiceType == 'catering';
              final isAddonProvider = provider.providerServiceType == 'addon';

                return Container(
                width: double.infinity,
                margin: const EdgeInsets.all(16),
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: primary.withOpacity(0.12),
                      child: const Icon(
                        Icons.storefront,
                        color: primary,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              provider.businessName,
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 6),

                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: primary.withOpacity(0.10),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                providerCategoryLabel(provider.providerCategory),
                                style: const TextStyle(
                                  color: primary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),

                            const SizedBox(height: 6),
                            Text(
                              'Verification: ${provider.verificationStatus}',
                              style: TextStyle(
                                color: provider.isVerified ? Colors.green : Colors.orange,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 12),

                            if (isCateringProvider) ...[
                              SizedBox(
                                width: double.infinity,
                                height: 46,
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => const ProviderPackagesScreen(),
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.inventory_2_outlined),
                                  label: const Text(
                                    'Manage Packages',
                                    style: TextStyle(fontWeight: FontWeight.w900),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),

                              SizedBox(
                                width: double.infinity,
                                height: 46,
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => const ProviderMenuItemsScreen(),
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.restaurant_menu),
                                  label: const Text(
                                    'Manage Menu Items',
                                    style: TextStyle(fontWeight: FontWeight.w900),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),

                              SizedBox(
                                width: double.infinity,
                                height: 46,
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => const ProviderAddonsScreen(),
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.add_box_outlined),
                                  label: const Text(
                                    'Manage Add-ons',
                                    style: TextStyle(fontWeight: FontWeight.w900),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),

                              SizedBox(
                                width: double.infinity,
                                height: 46,
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => ProviderRecoveryOpportunitiesScreen(
                                          provider: provider,
                                        ),
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.replay_circle_filled),
                                  label: const Text(
                                    'Recovery Opportunities',
                                    style: TextStyle(fontWeight: FontWeight.w900),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),
                              SizedBox(
                                width: double.infinity,
                                height: 46,
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => ProviderMyRecoveryOffersScreen(
                                          provider: provider,
                                        ),
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.history),
                                  label: const Text(
                                    'My Recovery Offers',
                                    style: TextStyle(fontWeight: FontWeight.w900),
                                  ),
                                ),
                              ),
                            ],
                            
                            if (isAddonProvider) ...[
                              SizedBox(
                                width: double.infinity,
                                height: 46,
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => const ProviderAddonsScreen(),
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.add_box_outlined),
                                  label: const Text(
                                    'Manage Services',
                                    style: TextStyle(fontWeight: FontWeight.w900),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),
                              SizedBox(
                                width: double.infinity,
                                height: 46,
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => const ProviderAddonRequestsScreen(),
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.assignment_outlined),
                                  label: const Text(
                                    'Service Requests',
                                    style: TextStyle(fontWeight: FontWeight.w900),
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            Expanded(
            child: FutureBuilder<ProviderModel?>(
              future: repository.getMyProviderProfile(),
              builder: (context, providerSnapshot) {
                if (providerSnapshot.connectionState ==
                    ConnectionState.waiting) {
                  return const FeastaSkeletonDashboard();
                }

                final provider = providerSnapshot.data;

                if (provider == null) {
                  return const Center(
                    child: Text('Provider profile not found.'),
                  );
                }

                final isAddonProvider = provider.providerServiceType == 'addon';

                if (isAddonProvider) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.assignment_outlined,
                            size: 80,
                            color: Colors.grey,
                          ),
                          const SizedBox(height: 16),
                          const Text(
                            'Your add-on service requests will appear here.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Open service requests to view, accept, or reject customer requests from the marketplace.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.grey,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 18),
                          SizedBox(
                            width: double.infinity,
                            height: 50,
                            child: ElevatedButton.icon(
                              onPressed: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => const ProviderAddonRequestsScreen(),
                                  ),
                                );
                              },
                              icon: const Icon(Icons.assignment_outlined),
                              label: const Text(
                                'View Service Requests',
                                style: TextStyle(fontWeight: FontWeight.w900),
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: primary,
                                foregroundColor: Colors.white,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                return Column(
                  children: [
                    SizedBox(
                      height: 46,
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        scrollDirection: Axis.horizontal,
                        itemCount: filters.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 10),
                        itemBuilder: (context, index) {
                          final filter = filters[index];
                          final isSelected = selectedFilter == filter;

                          return ChoiceChip(
                            label: Text(statusLabel(filter)),
                            selected: isSelected,
                            selectedColor: primary.withOpacity(0.15),
                            labelStyle: TextStyle(
                              color: isSelected ? primary : Colors.grey,
                              fontWeight: FontWeight.w800,
                            ),
                            onSelected: (_) {
                              setState(() {
                                selectedFilter = filter;
                              });
                            },
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: StreamBuilder<List<BookingModel>>(
                        stream: repository.providerBookingsByOwner(),
                        builder: (context, snapshot) {
                          if (snapshot.connectionState ==
                              ConnectionState.waiting) {
                            return const FeastaSkeletonList(
                              itemCount: 5,
                              padding: EdgeInsets.all(16),
                            );
                          }

                          if (snapshot.hasError) {
                            return Center(
                              child: Text('Error: ${snapshot.error}'),
                            );
                          }

                          final bookings = (snapshot.data ?? [])
                              .where((booking) => booking.status == selectedFilter)
                              .toList();

                          if (bookings.isEmpty) {
                            return Center(
                              child: Text(
                                'No ${statusLabel(selectedFilter).toLowerCase()} bookings.',
                                style: const TextStyle(color: Colors.grey),
                              ),
                            );
                          }

                          return ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: bookings.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 14),
                            itemBuilder: (context, index) {
                              final booking = bookings[index];

                              return ProviderBookingCard(
                                booking: booking,
                                statusLabel: statusLabel(booking.status),
                                statusColor: statusColor(booking.status),
                              );
                            },
                          );
                        },
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class ProviderBookingCard extends StatelessWidget {
  final BookingModel booking;
  final String statusLabel;
  final Color statusColor;

  const ProviderBookingCard({
    super.key,
    required this.booking,
    required this.statusLabel,
    required this.statusColor,
  });

  String get formattedDate {
    final date = booking.eventDate;

    if (date == null) return 'No date';

    return '${date.month}/${date.day}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProviderBookingDetailsScreen(
              bookingId: booking.id,
            ),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: primary.withOpacity(0.12),
                  child: const Icon(Icons.person, color: primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '${booking.customerFirstName} ${booking.customerLastName}',
                    style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      color: statusColor,
                      fontWeight: FontWeight.w900,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              booking.packageName,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.event, color: Colors.grey, size: 20),
                const SizedBox(width: 6),
                Text(
                  '$formattedDate • ${booking.eventTime}',
                  style: const TextStyle(color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.people_outline, color: Colors.grey, size: 20),
                const SizedBox(width: 6),
                Text(
                  '${booking.guestCount} guests',
                  style: const TextStyle(color: Colors.grey),
                ),
                const Spacer(),
                Text(
                  '₱${booking.totalAmount.toStringAsFixed(0)}',
                  style: const TextStyle(
                    color: primary,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ProviderBookingDetailsScreen(
                        bookingId: booking.id,
                      ),
                    ),
                  );
                },
                child: const Text(
                  'View Request',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
