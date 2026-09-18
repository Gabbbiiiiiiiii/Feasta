import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../authentication/data/repositories/feasta_repository.dart';

class ChatScreen extends StatefulWidget {
  final BookingModel? booking;
  final String currentRole;
  final String? existingChatRoomId;

  const ChatScreen({
    super.key,
    this.booking,
    required this.currentRole,
    this.existingChatRoomId,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final FeastaRepository repository = FeastaRepository();
  final TextEditingController messageController = TextEditingController();

  bool isSending = false;
  String? chatRoomId;

  @override
  void initState() {
    super.initState();
    _prepareChatRoom();
  }

  Future<void> _prepareChatRoom() async {
    try {
      final suppliedRoomId = widget.existingChatRoomId?.trim();

      String id;

      if (suppliedRoomId != null && suppliedRoomId.isNotEmpty) {
        id = suppliedRoomId;
      } else {
        final booking = widget.booking;

        if (booking == null) {
          throw Exception(
            'This conversation is missing its booking information.',
          );
        }

        id = await repository.createChatRoom(booking: booking);
      }

      if (!mounted) return;

      setState(() {
        chatRoomId = id;
      });

      try {
        await repository.markChatAsRead(chatRoomId: id);
      } catch (error, stackTrace) {
        debugPrint(
          'FEASTA CHAT: markChatAsRead failed '
          'chatRoom=$id '
          'error=$error',
        );

        debugPrintStack(stackTrace: stackTrace);
      }
    } catch (error, stackTrace) {
      debugPrint('FEASTA CHAT: failed to prepare conversation: $error');

      debugPrintStack(stackTrace: stackTrace);

      if (!mounted) return;

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceAll('Exception: ', '')),
          ),
        );
    }
  }

  Future<void> _sendMessage() async {
    final message = messageController.text.trim();
    final roomId = chatRoomId?.trim();

    if (message.isEmpty || roomId == null || roomId.isEmpty || isSending) {
      return;
    }

    setState(() {
      isSending = true;
    });

    try {
      await repository.sendMessage(chatRoomId: roomId, message: message);

      messageController.clear();
    } catch (error, stackTrace) {
      debugPrint(
        'FEASTA CHAT: sendMessage failed '
        'chatRoom=$roomId '
        'error=$error',
      );

      debugPrintStack(stackTrace: stackTrace);

      if (!mounted) return;

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceAll('Exception: ', '')),
          ),
        );
    } finally {
      if (mounted) {
        setState(() {
          isSending = false;
        });
      }
    }
  }

  String get chatTitle {
    final booking = widget.booking;

    if (booking == null) {
      return 'Conversation';
    }

    if (widget.currentRole == UserRoles.customer) {
      final providerName = booking.providerBusinessName.trim();

      if (providerName.isNotEmpty) {
        return providerName;
      }

      return 'Conversation';
    }

    final firstName = booking.customerFirstName.trim();
    final lastName = booking.customerLastName.trim();
    final customerName = '$firstName $lastName'.trim();

    if (customerName.isNotEmpty) {
      return customerName;
    }

    return 'Conversation';
  }

  void _markCurrentRoomAsReadSafely() {
    final roomId = chatRoomId?.trim();

    if (roomId == null || roomId.isEmpty) {
      return;
    }

    repository.markChatAsRead(chatRoomId: roomId).catchError((
      Object error,
      StackTrace stackTrace,
    ) {
      debugPrint(
        'FEASTA CHAT: dispose markChatAsRead failed '
        'chatRoom=$roomId '
        'error=$error',
      );

      debugPrintStack(stackTrace: stackTrace);
    });
  }

  @override
  void dispose() {
    _markCurrentRoomAsReadSafely();
    messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final roomId = chatRoomId;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.mainText,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Text(
          chatTitle,
          style: theme.textTheme.titleLarge?.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      body: roomId == null
          ? const FeastaSkeletonChat()
          : Column(
              children: [
                Expanded(
                  child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    stream: repository.chatMessages(roomId),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting &&
                          !snapshot.hasData) {
                        return const FeastaSkeletonChat();
                      }

                      if (snapshot.hasError) {
                        debugPrint(
                          'FEASTA CHAT: message stream failed '
                          'chatRoom=$roomId '
                          'error=${snapshot.error}',
                        );

                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.error_outline_rounded,
                                  size: 42,
                                  color: AppColors.secondaryTextAccessible,
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  'Unable to load this conversation.',
                                  textAlign: TextAlign.center,
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    color: AppColors.mainText,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  snapshot.error.toString().replaceAll(
                                    'Exception: ',
                                    '',
                                  ),
                                  textAlign: TextAlign.center,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: AppColors.secondaryTextAccessible,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }

                      final messages = snapshot.data?.docs ?? [];

                      if (messages.isEmpty) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              'No messages yet. Start the conversation.',
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: AppColors.secondaryTextAccessible,
                              ),
                            ),
                          ),
                        );
                      }

                      return ListView.builder(
                        reverse: true,
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                        itemCount: messages.length,
                        itemBuilder: (context, index) {
                          final data = messages[index].data();

                          final senderId = data['senderId']?.toString() ?? '';

                          final senderRole =
                              data['senderRole']?.toString() ?? '';

                          final message = data['message']?.toString() ?? '';

                          final createdAt = data['createdAt'];

                          final isMine = senderId == repository.currentUid;

                          return ChatBubble(
                            message: message,
                            senderRole: senderRole,
                            isMine: isMine,
                            createdAt: createdAt,
                          );
                        },
                      );
                    },
                  ),
                ),
                Container(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                  decoration: const BoxDecoration(
                    color: AppColors.surface,
                    border: Border(top: BorderSide(color: AppColors.border)),
                  ),
                  child: SafeArea(
                    top: false,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: TextField(
                            controller: messageController,
                            minLines: 1,
                            maxLines: 4,
                            textInputAction: TextInputAction.newline,
                            style: const TextStyle(color: AppColors.mainText),
                            decoration: InputDecoration(
                              hintText: 'Type a message...',
                              hintStyle: const TextStyle(
                                color: AppColors.secondaryTextAccessible,
                              ),
                              filled: true,
                              fillColor: AppColors.surfaceMuted,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(24),
                                borderSide: BorderSide.none,
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(24),
                                borderSide: BorderSide.none,
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(24),
                                borderSide: const BorderSide(
                                  color: AppColors.focus,
                                  width: 1.5,
                                ),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 18,
                                vertical: 12,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        CircleAvatar(
                          backgroundColor: AppColors.primary,
                          radius: 26,
                          child: IconButton(
                            onPressed: isSending ? null : _sendMessage,
                            icon: isSending
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      color: AppColors.primaryForeground,
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(
                                    Icons.send_rounded,
                                    color: AppColors.primaryForeground,
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class ChatBubble extends StatelessWidget {
  final String message;
  final String senderRole;
  final bool isMine;
  final dynamic createdAt;

  const ChatBubble({
    super.key,
    required this.message,
    required this.senderRole,
    required this.isMine,
    required this.createdAt,
  });

  String get timeText {
    if (createdAt is Timestamp) {
      final date = (createdAt as Timestamp).toDate();

      final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;

      final minute = date.minute.toString().padLeft(2, '0');

      final period = date.hour >= 12 ? 'PM' : 'AM';

      return '$hour:$minute $period';
    }

    return '';
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.72,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isMine ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(isMine ? 18 : 4),
            bottomRight: Radius.circular(isMine ? 4 : 18),
          ),
          border: isMine ? null : Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: isMine
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            Text(
              message,
              style: TextStyle(
                color: isMine
                    ? AppColors.primaryForeground
                    : AppColors.mainText,
                height: 1.35,
              ),
            ),
            if (timeText.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                timeText,
                style: TextStyle(
                  color: isMine
                      ? AppColors.primaryForeground.withValues(alpha: 0.72)
                      : AppColors.secondaryTextAccessible,
                  fontSize: 11,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
