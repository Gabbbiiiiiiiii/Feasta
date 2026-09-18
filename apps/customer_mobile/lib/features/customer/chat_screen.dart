import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../authentication/data/repositories/feasta_repository.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    required this.booking,
    required this.currentRole,
    this.existingChatRoomId,
    super.key,
  });

  final BookingModel booking;
  final String currentRole;
  final String? existingChatRoomId;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final FeastaRepository repository = FeastaRepository();
  final TextEditingController messageController = TextEditingController();

  bool isSending = false;
  bool isPreparing = true;
  String? chatRoomId;
  String? preparationError;

  @override
  void initState() {
    super.initState();
    _prepareChatRoom();
  }

  Future<void> _prepareChatRoom() async {
    try {
      final suppliedRoomId = widget.existingChatRoomId?.trim();

      final id = suppliedRoomId != null && suppliedRoomId.isNotEmpty
          ? suppliedRoomId
          : await repository.createChatRoom(booking: widget.booking);

      if (!mounted) {
        return;
      }

      setState(() {
        chatRoomId = id;
      });

      try {
        await repository.markChatAsRead(chatRoomId: id);
      } catch (_) {
        // Do not block opening the conversation if marking it read fails.
      }
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceAll('Exception: ', '')),
          ),
        );
    }
  }

  Future<void> _markRoomAsRead() async {
    final id = chatRoomId;
    if (id == null || id.isEmpty) return;

    try {
      await repository.markChatAsRead(chatRoomId: id);
    } catch (_) {
      // Do not block the conversation if the read-receipt write fails.
    }
  }

  Future<void> _sendMessage() async {
    final message = messageController.text.trim();
    final id = chatRoomId;

    if (message.isEmpty || id == null || id.isEmpty || isSending) return;

    setState(() {
      isSending = true;
    });

    try {
      await repository.sendMessage(chatRoomId: id, message: message);

      if (!mounted) return;

      messageController.clear();

      setState(() {
        isSending = false;
      });

      _markRoomAsRead();
    } catch (error) {
      if (!mounted) return;

      setState(() {
        isSending = false;
      });

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceAll('Exception: ', '')),
          ),
        );
    }
  }

  String get chatTitle {
    if (widget.currentRole == UserRoles.customer) {
      return widget.booking.providerBusinessName;
    }

    return '${widget.booking.customerFirstName} '
        '${widget.booking.customerLastName}';
  }

  @override
  void dispose() {
    messageController.dispose();

    final id = chatRoomId;
    if (id != null && id.isNotEmpty) {
      repository.markChatAsRead(chatRoomId: id);
    }

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        title: Text(
          chatTitle,
          style: const TextStyle(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (isPreparing) {
      return const FeastaSkeletonChat();
    }

    if (preparationError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.chat_bubble_outline_rounded,
                size: 52,
                color: AppColors.secondaryTextAccessible,
              ),
              const SizedBox(height: 16),
              const Text(
                'Conversation could not be opened',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.mainText,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                preparationError!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.secondaryTextAccessible,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _prepareChatRoom,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Try again'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: AppColors.primaryForeground,
                ),
              ),
            ],
          ),
        ),
      );
    }

    final id = chatRoomId;

    if (id == null || id.isEmpty) {
      return const Center(
        child: Text(
          'Conversation is unavailable.',
          style: TextStyle(color: AppColors.secondaryTextAccessible),
        ),
      );
    }

    return Column(
      children: [
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: repository.chatMessages(id),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting &&
                  !snapshot.hasData) {
                return const FeastaSkeletonChat();
              }

              if (snapshot.hasError) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'Messages could not be loaded.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ),
                );
              }

              final messages = snapshot.data?.docs ?? [];

              if (messages.isEmpty) {
                return const Center(
                  child: Text(
                    'No messages yet. Start the conversation.',
                    style: TextStyle(color: AppColors.secondaryTextAccessible),
                  ),
                );
              }

              return ListView.builder(
                reverse: true,
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.all(16),
                itemCount: messages.length,
                itemBuilder: (context, index) {
                  final data = messages[index].data();

                  final senderId = data['senderId']?.toString() ?? '';
                  final senderRole = data['senderRole']?.toString() ?? '';
                  final message = data['message']?.toString() ?? '';
                  final createdAt = data['createdAt'];

                  return ChatBubble(
                    message: message,
                    senderRole: senderRole,
                    isMine: senderId == repository.currentUid,
                    createdAt: createdAt,
                  );
                },
              );
            },
          ),
        ),
        _MessageComposer(
          controller: messageController,
          isSending: isSending,
          onSend: _sendMessage,
        ),
      ],
    );
  }
}

class _MessageComposer extends StatelessWidget {
  const _MessageComposer({
    required this.controller,
    required this.isSending,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool isSending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 4,
                decoration: InputDecoration(
                  hintText: 'Type a message...',
                  filled: true,
                  fillColor: AppColors.surfaceMuted,
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: AppColors.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(
                      color: AppColors.primary,
                      width: 1.4,
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
              backgroundColor: isSending
                  ? AppColors.disabled
                  : AppColors.primary,
              radius: 26,
              child: IconButton(
                tooltip: 'Send message',
                onPressed: isSending ? null : onSend,
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
    );
  }
}

class ChatBubble extends StatelessWidget {
  const ChatBubble({
    required this.message,
    required this.senderRole,
    required this.isMine,
    required this.createdAt,
    super.key,
  });

  final String message;
  final String senderRole;
  final bool isMine;
  final dynamic createdAt;

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
                      ? AppColors.primaryForeground.withValues(alpha: 0.75)
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
