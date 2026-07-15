import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/constants/firestore_collections.dart';
import '../../core/constants/status_constants.dart';
import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../customer/booking_details_screen.dart';
import '../customer/chat_screen.dart';

const Color _primary = Color(0xFFFF6333);
const Color _textPrimary = Color(0xFF2B211D);
const Color _textSecondary = Color(0xFF8C817A);
const Color _border = Color(0xFFE8E1DB);
const Color _softSurface = Color(0xFFFFFBF8);

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final FeastaRepository repository = FeastaRepository();
  bool showUnreadOnly = false;
  bool isMarkingAll = false;

  Future<void> _markAllAsRead(int unreadCount) async {
    if (unreadCount == 0 || isMarkingAll) return;

    setState(() {
      isMarkingAll = true;
    });

    try {
      await repository.markAllNotificationsAsRead();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('All notifications marked as read.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          isMarkingAll = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _primary,
      body: SafeArea(
        child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: repository.myNotifications(),
          builder: (context, snapshot) {
            final isLoading =
                snapshot.connectionState == ConnectionState.waiting;
            final docs = [...?snapshot.data?.docs];

            docs.sort((a, b) {
              final aDate = a.data()['createdAt'];
              final bDate = b.data()['createdAt'];

              if (aDate is Timestamp && bDate is Timestamp) {
                return bDate.compareTo(aDate);
              }

              return 0;
            });

            final unreadCount = docs.where((doc) {
              return doc.data()['isRead'] != true;
            }).length;

            final visibleDocs = showUnreadOnly
                ? docs.where((doc) => doc.data()['isRead'] != true).toList()
                : docs;

            return Column(
              children: [
                _NotificationInboxHeader(
                  unreadCount: unreadCount,
                  isMarkingAll: isMarkingAll,
                  onBack: () => Navigator.of(context).maybePop(),
                  onMarkAll: () => _markAllAsRead(unreadCount),
                ),
                Expanded(
                  child: Container(
                    width: double.infinity,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(30),
                      ),
                    ),
                    child: Column(
                      children: [
                        _NotificationFilterBar(
                          showUnreadOnly: showUnreadOnly,
                          unreadCount: unreadCount,
                          onChanged: (value) {
                            setState(() {
                              showUnreadOnly = value;
                            });
                          },
                        ),
                        Expanded(
                          child: _NotificationBody(
                            isLoading: isLoading,
                            error: snapshot.error,
                            docs: visibleDocs,
                            showUnreadOnly: showUnreadOnly,
                            repository: repository,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _NotificationInboxHeader extends StatelessWidget {
  final int unreadCount;
  final bool isMarkingAll;
  final VoidCallback onBack;
  final VoidCallback onMarkAll;

  const _NotificationInboxHeader({
    required this.unreadCount,
    required this.isMarkingAll,
    required this.onBack,
    required this.onMarkAll,
  });

  @override
  Widget build(BuildContext context) {
    final subtitle = unreadCount == 0
        ? "You're all caught up"
        : '$unreadCount unread update${unreadCount == 1 ? '' : 's'}';

    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 10, 16, 22),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(
              Icons.arrow_back_rounded,
              color: Colors.white,
              size: 30,
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Notifications',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    height: 1.05,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.82),
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: unreadCount == 0 || isMarkingAll ? null : onMarkAll,
            style: TextButton.styleFrom(
              foregroundColor: _primary,
              disabledForegroundColor: Colors.white.withOpacity(0.55),
              backgroundColor: unreadCount == 0
                  ? Colors.white.withOpacity(0.12)
                  : Colors.white,
              padding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 10,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            icon: isMarkingAll
                ? const SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: _primary,
                    ),
                  )
                : const Icon(Icons.done_all_rounded, size: 18),
            label: const Text(
              'Read all',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationFilterBar extends StatelessWidget {
  final bool showUnreadOnly;
  final int unreadCount;
  final ValueChanged<bool> onChanged;

  const _NotificationFilterBar({
    required this.showUnreadOnly,
    required this.unreadCount,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 10),
      child: Row(
        children: [
          _FilterPill(
            label: 'All',
            selected: !showUnreadOnly,
            onTap: () => onChanged(false),
          ),
          const SizedBox(width: 10),
          _FilterPill(
            label: unreadCount == 0 ? 'Unread' : 'Unread $unreadCount',
            selected: showUnreadOnly,
            onTap: () => onChanged(true),
          ),
        ],
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? _primary : const Color(0xFFF5F2EF),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : _textPrimary,
              fontWeight: FontWeight.w900,
              fontSize: 14,
            ),
          ),
        ),
      ),
    );
  }
}

class _NotificationBody extends StatelessWidget {
  final bool isLoading;
  final Object? error;
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs;
  final bool showUnreadOnly;
  final FeastaRepository repository;

  const _NotificationBody({
    required this.isLoading,
    required this.error,
    required this.docs,
    required this.showUnreadOnly,
    required this.repository,
  });

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const _NotificationLoadingList();
    }

    if (error != null) {
      return _NotificationInfoState(
        icon: Icons.wifi_off_rounded,
        title: 'Could not load notifications',
        message: error.toString(),
      );
    }

    if (docs.isEmpty) {
      return _NotificationInfoState(
        icon: showUnreadOnly
            ? Icons.mark_email_read_rounded
            : Icons.notifications_none_rounded,
        title: showUnreadOnly ? 'No unread notifications' : 'No notifications',
        message: showUnreadOnly
            ? "You're all caught up for now."
            : 'Booking updates, chat messages, and payment notices will appear here.',
      );
    }

    final groups = _groupNotifications(docs);

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 2, 16, 24),
      itemCount: groups.length,
      itemBuilder: (context, groupIndex) {
        final group = groups[groupIndex];

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.only(
                top: groupIndex == 0 ? 8 : 18,
                bottom: 10,
                left: 2,
              ),
              child: Text(
                group.label,
                style: const TextStyle(
                  color: _textSecondary,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            ...group.docs.map(
              (doc) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: NotificationCard(
                  notificationId: doc.id,
                  data: doc.data(),
                  repository: repository,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _NotificationLoadingList extends StatelessWidget {
  const _NotificationLoadingList();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
      itemCount: 5,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        return Container(
          height: 104,
          decoration: BoxDecoration(
            color: _softSurface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: _border),
          ),
          child: Row(
            children: [
              const SizedBox(width: 16),
              Container(
                height: 46,
                width: 46,
                decoration: BoxDecoration(
                  color: const Color(0xFFEFE8E2),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 13,
                      width: 150,
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFE8E2),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      height: 11,
                      width: double.infinity,
                      margin: const EdgeInsets.only(right: 34),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFE8E2),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
            ],
          ),
        );
      },
    );
  }
}

class _NotificationInfoState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;

  const _NotificationInfoState({
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              height: 82,
              width: 82,
              decoration: BoxDecoration(
                color: const Color(0xFFFFF1EB),
                borderRadius: BorderRadius.circular(28),
              ),
              child: Icon(
                icon,
                size: 38,
                color: _primary,
              ),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: _textPrimary,
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: _textSecondary,
                height: 1.4,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class NotificationCard extends StatelessWidget {
  final String notificationId;
  final Map<String, dynamic> data;
  final FeastaRepository repository;

  const NotificationCard({
    super.key,
    required this.notificationId,
    required this.data,
    required this.repository,
  });

  String get title => data['title'] ?? 'Notification';
  String get message => data['message'] ?? '';
  String get type => data['type'] ?? 'system';
  bool get isRead => data['isRead'] ?? false;
  Timestamp? get createdAt {
    final value = data['createdAt'];
    return value is Timestamp ? value : null;
  }

  IconData get icon => _notificationIcon(type);
  Color get color => _notificationColor(type);
  String get typeLabel => _notificationTypeLabel(type);

  Future<void> _markAsRead(BuildContext context) async {
    if (isRead) return;

    try {
      await repository.markNotificationAsRead(notificationId);
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    }
  }

  Future<BookingModel?> _getBookingFromChatRoom(String chatRoomId) async {
    final chatRoomDoc = await FirebaseFirestore.instance
        .collection(FirestoreCollections.chatRooms)
        .doc(chatRoomId)
        .get();

    if (!chatRoomDoc.exists) return null;

    final data = chatRoomDoc.data();
    final bookingId = data?['bookingId'];

    if (bookingId == null || bookingId.toString().isEmpty) {
      return null;
    }

    final bookingDoc = await FirebaseFirestore.instance
        .collection(FirestoreCollections.bookings)
        .doc(bookingId)
        .get();

    if (!bookingDoc.exists) return null;

    return BookingModel.fromDoc(bookingDoc);
  }

  Future<void> _openNotification(BuildContext context) async {
    await _markAsRead(context);

    if (!context.mounted) return;

    final relatedId = data['relatedId']?.toString() ?? '';
    final relatedCollection = data['relatedCollection']?.toString() ?? '';

    if (relatedId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No related item found.')),
      );
      return;
    }

    if (relatedCollection == FirestoreCollections.bookings) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => BookingDetailsScreen(
            bookingId: relatedId,
          ),
        ),
      );
      return;
    }

    if (relatedCollection == FirestoreCollections.chatRooms) {
      final booking = await _getBookingFromChatRoom(relatedId);

      if (!context.mounted) return;

      if (booking == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Chat booking not found.')),
        );
        return;
      }

      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ChatScreen(
            booking: booking,
            currentRole: booking.customerId == repository.currentUid
                ? UserRoles.customer
                : UserRoles.provider,
          ),
        ),
      );
      return;
    }

    if (relatedCollection == FirestoreCollections.addonRequests) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Add-on request details screen will be connected next.'),
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('This notification type is not connected yet.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final timeText = _relativeNotificationTime(createdAt);

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: () => _openNotification(context),
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: isRead ? Colors.white : _softSurface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: isRead ? _border : color.withOpacity(0.36),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0D000000),
                blurRadius: 18,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: 5,
                  color: isRead ? Colors.transparent : color,
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(13, 14, 14, 14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          height: 48,
                          width: 48,
                          decoration: BoxDecoration(
                            color: color.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(17),
                          ),
                          child: Icon(
                            icon,
                            color: color,
                            size: 25,
                          ),
                        ),
                        const SizedBox(width: 13),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  _NotificationTypeChip(
                                    label: typeLabel,
                                    color: color,
                                  ),
                                  const Spacer(),
                                  if (timeText.isNotEmpty)
                                    Text(
                                      timeText,
                                      style: const TextStyle(
                                        color: _textSecondary,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 9),
                              Text(
                                title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: _textPrimary,
                                  fontSize: 16,
                                  height: 1.15,
                                  fontWeight: isRead
                                      ? FontWeight.w800
                                      : FontWeight.w900,
                                ),
                              ),
                              if (message.isNotEmpty) ...[
                                const SizedBox(height: 7),
                                Text(
                                  message,
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: isRead
                                        ? _textSecondary
                                        : const Color(0xFF5E5651),
                                    fontSize: 13,
                                    height: 1.35,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Text(
                                    isRead ? 'Opened' : 'Unread',
                                    style: TextStyle(
                                      color: isRead ? _textSecondary : color,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    'View',
                                    style: TextStyle(
                                      color: color,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  Icon(
                                    Icons.chevron_right_rounded,
                                    color: color,
                                    size: 20,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NotificationTypeChip extends StatelessWidget {
  final String label;
  final Color color;

  const _NotificationTypeChip({
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.11),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _NotificationGroup {
  final String label;
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs;

  const _NotificationGroup({
    required this.label,
    required this.docs,
  });
}

List<_NotificationGroup> _groupNotifications(
  List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
) {
  final groups = <_NotificationGroup>[];

  for (final doc in docs) {
    final createdAt = doc.data()['createdAt'];
    final label = createdAt is Timestamp
        ? _notificationSectionLabel(createdAt.toDate())
        : 'Earlier';

    if (groups.isEmpty || groups.last.label != label) {
      groups.add(_NotificationGroup(label: label, docs: [doc]));
    } else {
      groups.last.docs.add(doc);
    }
  }

  return groups;
}

String _notificationSectionLabel(DateTime date) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final target = DateTime(date.year, date.month, date.day);
  final dayDifference = today.difference(target).inDays;

  if (dayDifference == 0) return 'Today';
  if (dayDifference == 1) return 'Yesterday';
  if (dayDifference < 7) return 'This week';

  return '${_monthName(date.month)} ${date.year}';
}

String _relativeNotificationTime(Timestamp? timestamp) {
  if (timestamp == null) return '';

  final date = timestamp.toDate();
  final now = DateTime.now();
  final difference = now.difference(date);

  if (difference.inMinutes < 1) return 'Now';
  if (difference.inMinutes < 60) return '${difference.inMinutes}m';
  if (difference.inHours < 24) return '${difference.inHours}h';
  if (difference.inDays < 7) return '${difference.inDays}d';

  return '${date.month}/${date.day}/${date.year}';
}

IconData _notificationIcon(String type) {
  switch (type) {
    case NotificationType.booking:
      return Icons.event_available_rounded;
    case NotificationType.payment:
      return Icons.account_balance_wallet_rounded;
    case NotificationType.chat:
      return Icons.chat_bubble_rounded;
    case NotificationType.review:
      return Icons.star_rounded;
    case NotificationType.verification:
      return Icons.verified_user_rounded;
    case NotificationType.system:
    default:
      return Icons.notifications_rounded;
  }
}

Color _notificationColor(String type) {
  switch (type) {
    case NotificationType.booking:
      return _primary;
    case NotificationType.payment:
      return const Color(0xFF16A34A);
    case NotificationType.chat:
      return const Color(0xFF2563EB);
    case NotificationType.review:
      return const Color(0xFFF59E0B);
    case NotificationType.verification:
      return const Color(0xFF7C3AED);
    case NotificationType.system:
    default:
      return const Color(0xFF6B7280);
  }
}

String _notificationTypeLabel(String type) {
  switch (type) {
    case NotificationType.booking:
      return 'Booking';
    case NotificationType.payment:
      return 'Payment';
    case NotificationType.chat:
      return 'Message';
    case NotificationType.review:
      return 'Review';
    case NotificationType.verification:
      return 'Account';
    case NotificationType.system:
    default:
      return 'Update';
  }
}

String _monthName(int month) {
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  if (month < 1 || month > names.length) return 'Earlier';
  return names[month - 1];
}
