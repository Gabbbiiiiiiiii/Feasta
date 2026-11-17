import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// Read-only customer feed. Firestore rules enforce audience access.
class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  int _limit = 10;
  int _retry = 0;
  late Stream<QuerySnapshot<Map<String, dynamic>>> _feed;

  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  void _subscribe() {
    _feed = FirebaseFirestore.instance
        .collection('announcements')
        .where('status', isEqualTo: 'published')
        .where('isDeleted', isEqualTo: false)
        .where('audience', whereIn: ['everyone', 'customers'])
        .orderBy('publishedAt', descending: true)
        .limit(_limit + 1)
        .snapshots();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Official announcements')),
      body: StreamBuilder<User?>(
        stream: FirebaseAuth.instance.authStateChanges(),
        initialData: FirebaseAuth.instance.currentUser,
        builder: (context, auth) {
          if (auth.data == null) {
            return const Center(child: Text('Sign in to view announcements.'));
          }
          return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            key: ValueKey('${auth.data!.uid}:$_limit:$_retry'),
            stream: _feed,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'Announcements could not be loaded. Please check your connection and sign-in.',
                        ),
                        TextButton(
                          onPressed: () => setState(() {
                            _retry++;
                            _subscribe();
                          }),
                          child: const Text('Try again'),
                        ),
                      ],
                    ),
                  ),
                );
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              final docs = snapshot.data!.docs;
              final visible = docs
                  .take(_limit)
                  .where((doc) => isCustomerAnnouncement(doc.data()))
                  .toList();
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const Text(
                    'Updates for everyone and customers. Separate from your personal notifications.',
                  ),
                  const SizedBox(height: 16),
                  if (visible.isEmpty)
                    const Text('No published announcements for you right now.'),
                  for (final doc in visible)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              doc.data()['title'] as String,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                                color: AppColors.primary,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '${doc.data()['audience'] == 'everyone' ? 'Everyone' : 'Customers'} · ${announcementManilaDate(doc.data()['publishedAt'] as Timestamp)} (Manila)',
                            ),
                            const SizedBox(height: 12),
                            Text(doc.data()['content'] as String),
                          ],
                        ),
                      ),
                    ),
                  if (docs.length > _limit)
                    TextButton(
                      onPressed: () => setState(() {
                        _limit += 10;
                        _subscribe();
                      }),
                      child: const Text('Show more announcements'),
                    ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

bool isCustomerAnnouncement(Map<String, dynamic> data) =>
    data['status'] == 'published' &&
    data['isDeleted'] == false &&
    ['everyone', 'customers'].contains(data['audience']) &&
    data['title'] is String &&
    (data['title'] as String).trim().isNotEmpty &&
    data['content'] is String &&
    (data['content'] as String).trim().isNotEmpty &&
    data['publishedAt'] is Timestamp;

String announcementManilaDate(Timestamp timestamp) {
  final date = timestamp.toDate().toUtc().add(const Duration(hours: 8));
  String pad(int value) => value.toString().padLeft(2, '0');
  return '${date.year}-${pad(date.month)}-${pad(date.day)} ${pad(date.hour)}:${pad(date.minute)}';
}
