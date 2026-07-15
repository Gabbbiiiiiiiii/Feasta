import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../repositories/feasta_repository.dart';
import 'package:flutter/material.dart';
import 'package:feasta/core/constants/firestore_collections.dart';

import '../widgets/dashboard/dashboard_widgets.dart';

class DashboardPage extends StatelessWidget {
  final List<StatData> stats;
  final List<ProviderData> topProviders;
  final List<String> quickActions;
  final List<ActivityItem> activities;
  final Map<String, String> platformHealth;

  const DashboardPage({
    super.key,
    this.stats = const [],
    this.topProviders = const [],
    this.quickActions = const [],
    this.activities = const [],
    this.platformHealth = const {},
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection(FirestoreCollections.appSettings)
          .doc('adminDashboard')
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: EdgeInsets.only(top: 80),
              child: CircularProgressIndicator(),
            ),
          );
        }

        if (snapshot.hasError) {
          return const Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: EdgeInsets.only(top: 80),
              child: Text('Failed to load dashboard settings'),
            ),
          );
        }

        final config = snapshot.data?.data() ?? {};

        return SingleChildScrollView(
        child: Align(
          alignment: Alignment.topLeft,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              maxWidth: 1500,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
              LayoutBuilder(
                builder: (context, constraints) {
                  final width = constraints.maxWidth;
                  final isDesktop = width >= 900;

                  final titleSection = Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                    Text(
                      config['title'] ?? 'Admin Dashboard',
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        config['subtitle'] ?? 'FEASTA Platform · Ormoc City',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              color: const Color(0xFF6B7280),
                              fontWeight: FontWeight.w500,
                            ),
                      ),
                    ],
                  );

                  if (isDesktop) {
                    return Row(
                      children: [
                        Expanded(child: titleSection),
                        const _HeaderActions(),
                      ],
                    );
                  }

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      titleSection,
                      const SizedBox(height: 12),
                      const _HeaderActions(),
                    ],
                  );
                },
              ),

              const SizedBox(height: 28),

              _StatsGrid(config: config),

              const SizedBox(height: 24),

              LayoutBuilder(
                builder: (context, constraints) {
                  final isWide = constraints.maxWidth >= 1000;

                  if (!isWide) {
                    return Column(
                      children: [
                        const RevenueChartCard(
                          title: 'Platform Revenue',
                        ),
                        const SizedBox(height: 18),
                        TopProvidersCard(
                          providers: topProviders,
                          title: config['topProvidersTitle'] ?? 'Top Providers',
                        ),
                        const SizedBox(height: 18),

                        QuickActionsCard(
                          actions: quickActions,
                          title: config['quickActionsTitle'] ?? 'Quick Actions',
                        ),
                        const SizedBox(height: 18),

                        PlatformHealthCard(
                          metrics: platformHealth,
                          title: config['platformHealthTitle'] ?? 'Platform Health',
                        ),
                        const SizedBox(height: 18),

                        RecentActivitiesCard(
                          activities: activities,
                          title: config['recentActivitiesTitle'] ?? 'Recent Activities',
                        ),
                      ],
                    );
                  }
                  

                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 68,
                        child: Column(
                          children: [
                            const RevenueChartCard(
                              title: 'Platform Revenue',
                            ),

                            const SizedBox(height: 24),

                            RecentActivitiesCard(
                              activities: activities,
                              title: config['recentActivitiesTitle'] ?? 'Recent Activities',
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 24),
                      Expanded(
                        flex: 32,
                        child: Column(
                          children: [
                            TopProvidersCard(
                              providers: topProviders,
                              title: config['topProvidersTitle'] ?? 'Top Providers',
                            ),

                            const SizedBox(height: 16),

                            QuickActionsCard(
                              actions: quickActions,
                              title: config['quickActionsTitle'] ?? 'Quick Actions',
                            ),

                            const SizedBox(height: 16),

                            PlatformHealthCard(
                              metrics: platformHealth,
                              title: config['platformHealthTitle'] ?? 'Platform Health',
                                ),
                              ],
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _HeaderActions extends StatelessWidget {
  const _HeaderActions({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final repository = FeastaRepository();

    return Row(mainAxisSize: MainAxisSize.min, children: [
      StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: repository.myNotifications(),
        builder: (context, snap) {
          final docs = [...?snap.data?.docs];
          final unread = docs.where((d) => d.data()['isRead'] != true).length;

          return Tooltip(
            message: 'Notifications',
            child: MouseRegion(
              cursor: SystemMouseCursors.click,
              child: Material(
                color: const Color(0xFFF8F9FB),
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  overlayColor: MaterialStateProperty.resolveWith((states) => states.contains(MaterialState.hovered) || states.contains(MaterialState.focused) ? Colors.black.withOpacity(0.04) : null),
                  onTap: () {
                    try {
                      Navigator.pushNamed(context, 'notifications');
                    } catch (_) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Notifications page not available')));
                    }
                  },
                  child: Semantics(
                    button: true,
                    label: 'Notifications',
                    child: Stack(clipBehavior: Clip.none, children: [
                      const Padding(padding: EdgeInsets.all(12), child: Icon(Icons.notifications_none_rounded, size: 20, color: Color(0xFF111827))),
                      if (unread > 0)
                        Positioned(
                          right: -2,
                          top: -2,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(color: const Color(0xFFEF4444), borderRadius: BorderRadius.circular(999)),
                            constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                            child: Center(child: Text(unread.toString(), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w700))),
                          ),
                        )
                    ]),
                  ),
                ),
              ),
            ),
          );
        },
      ),
      const SizedBox(width: 12),
      Tooltip(
        message: 'View Profile',
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          child: Material(
            color: const Color(0xFFF8F9FB),
            borderRadius: BorderRadius.circular(999),
            child: InkWell(
              borderRadius: BorderRadius.circular(999),
              overlayColor: MaterialStateProperty.resolveWith((states) => states.contains(MaterialState.hovered) || states.contains(MaterialState.focused) ? Colors.black.withOpacity(0.04) : null),
              onTap: () {
                try {
                  Navigator.pushNamed(context, 'admin_profile');
                } catch (_) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile page not available')));
                }
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), border: Border.all(color: const Color(0xFFE9EDF3))),
                child: Row(children: [
                  CircleAvatar(radius: 16, backgroundColor: const Color(0xFF111827), child: Text(FirebaseAuth.instance.currentUser?.email?.split('@').first.substring(0, 1).toUpperCase() ?? 'A', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
                  const SizedBox(width: 10),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Text(FirebaseAuth.instance.currentUser?.email?.split('@').first ?? 'Admin', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                    Text('Super Admin', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: const Color(0xFF6B7280))),
                  ])
                ]),
              ),
            ),
          ),
        ),
      ),
    ]);
  }
}

class _StatsGrid extends StatelessWidget {
  final Map<String, dynamic> config;

  const _StatsGrid({required this.config});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final double maxExtent =
            w >= 1200 ? 360 : w >= 900 ? 320 : w >= 700 ? 300 : w;
        final double childAspect =
            w >= 1200 ? 2.5
            : w >= 900 ? 2.35
            : w >= 700 ? 2.15
            : 1.85;

        return GridView(
          gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: maxExtent,
            childAspectRatio: childAspect,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
          ),
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            FirestoreStatCard(
              title: 'Platform Revenue',
              symbol: '₱',
              accent: const Color(0xFFFF6B00),
              collection: FirestoreCollections.payments,
              sumField: 'amount',
            ),
            FirestoreStatCard(
              title: 'Active Users',
              
              icon: Icons.people_alt_rounded,
              accent: const Color(0xFFFF6B00),
              collection: FirestoreCollections.users,
            ),
            FirestoreStatCard(
              title: 'Total Bookings',
              
              icon: Icons.event_note_rounded,
              accent: const Color(0xFFF59E0B),
              collection: FirestoreCollections.bookings,
            ),
            FirestoreStatCard(
              title: 'Verification Queue',
            
              icon: Icons.verified_user_rounded,
              accent: const Color(0xFF22C55E),
              collection: FirestoreCollections.providerVerifications,
              filterKey: 'status',
              filterValue: 'pending',
            ),
          ],
        );
      },
    );
  }
}
