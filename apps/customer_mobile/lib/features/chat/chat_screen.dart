import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../authentication/data/repositories/feasta_repository.dart';

class ChatScreen extends StatefulWidget {
  final BookingModel booking;
  final String currentRole;

  /// When opening a conversation that already exists, such as from the
  /// Messages inbox, pass its Firestore document ID here.
  ///
  /// When null, the screen will ensure that a room exists for [booking].
  final String? existingChatRoomId;

  const ChatScreen({
    super.key,
    required this.booking,
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
  bool isPreparingRoom = true;

  String? chatRoomId;
  String? initializationError;

  @override
  void initState() {
    super.initState();
    _prepareChatRoom();
  }

  Future<void> _prepareChatRoom() async {
    if (mounted) {
      setState(() {
        isPreparingRoom = true;
        initializationError = null;
      });
    }

    try {
      final suppliedRoomId = widget.existingChatRoomId?.trim() ?? '';

      final String id;

      if (suppliedRoomId.isNotEmpty) {
        // Messages already knows which room was selected.
        // Do not run the room-creation path again.
        id = suppliedRoomId;
      } else {
        // Booking-based entry points may legitimately be starting the
        // conversation for the first time.
        id = await repository.createChatRoom(booking: widget.booking);
      }

      if (!mounted) {
        return;
      }

      setState(() {
        chatRoomId = id;
        isPreparingRoom = false;
      });

      // Read-state updates are secondary to opening the conversation.
      // A failure here should not prevent the user from reading messages.
      await _markRoomAsRead();
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        chatRoomId = null;
        isPreparingRoom = false;
        initializationError = _friendlyError(error);
      });
    }
  }

  Future<void> _markRoomAsRead() async {
    final id = chatRoomId;

    if (id == null || id.isEmpty) {
      return;
    }

    try {
      await repository.markChatAsRead(
        chatRoomId: id,
        currentRole: widget.currentRole,
      );
    } catch (_) {
      // A read-state failure must not make the conversation unusable.
    }
  }

  Future<void> _sendMessage() async {
    final id = chatRoomId;
    final message = messageController.text.trim();

    if (id == null || id.isEmpty || message.isEmpty || isSending) {
      return;
    }

    setState(() {
      isSending = true;
    });

    try {
      await repository.sendMessage(
        chatRoomId: id,
        senderRole: widget.currentRole,
        message: message,
      );

      if (!mounted) {
        return;
      }

      messageController.clear();

      // Message already succeeded.
      // Remove the send-button loading state immediately.
      setState(() {
        isSending = false;
      });

      // Read-state synchronization is secondary and should not keep
      // the send button spinning.
      _markRoomAsRead();
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        isSending = false;
      });

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(_friendlyError(error))));
    }
  }

  String get chatTitle {
    if (widget.currentRole == UserRoles.customer) {
      final providerName = widget.booking.providerBusinessName.trim();

      return providerName.isEmpty ? 'Conversation' : providerName;
    }

    final customerName =
        '${widget.booking.customerFirstName} '
                '${widget.booking.customerLastName}'
            .trim();

    return customerName.isEmpty ? 'Conversation' : customerName;
  }

  String _friendlyError(Object error) {
    final message = error.toString().replaceFirst('Exception: ', '').trim();

    if (message.isEmpty) {
      return 'We couldn\'t open this conversation. Please try again.';
    }

    return message;
  }

  @override
  void dispose() {
    messageController.dispose();

    final id = chatRoomId;

    if (id != null && id.isNotEmpty) {
      // Fire-and-forget cleanup. Read-state failures must not affect
      // navigation away from the conversation.
      repository
          .markChatAsRead(chatRoomId: id, currentRole: widget.currentRole)
          .catchError((_) {});
    }

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFB02F00);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          chatTitle,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: _buildBody(primary),
    );
  }

  Widget _buildBody(Color primary) {
    if (isPreparingRoom) {
      return const FeastaSkeletonChat();
    }

    if (initializationError != null) {
      return _ChatInitializationError(
        message: initializationError!,
        onRetry: _prepareChatRoom,
      );
    }

    final id = chatRoomId;

    if (id == null || id.isEmpty) {
      return _ChatInitializationError(
        message: 'The conversation could not be prepared.',
        onRetry: _prepareChatRoom,
      );
    }

    return Column(
      children: [
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: repository.chatMessages(id),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting &&
                  snapshot.data == null) {
                return const FeastaSkeletonChat();
              }

              if (snapshot.hasError) {
                return const _MessagesLoadError();
              }

              final messages =
                  snapshot.data?.docs ??
                  const <QueryDocumentSnapshot<Map<String, dynamic>>>[];

              if (messages.isEmpty) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'No messages yet. Start the conversation.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                );
              }

              return ListView.builder(
                reverse: true,
                padding: const EdgeInsets.all(16),
                itemCount: messages.length,
                itemBuilder: (context, index) {
                  final data = messages[index].data();

                  final senderId = data['senderId']?.toString() ?? '';
                  final senderRole = data['senderRole']?.toString() ?? '';
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
          padding: const EdgeInsets.all(12),
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: Color(0xFFE5E7EB))),
          ),
          child: SafeArea(
            top: false,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: messageController,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.newline,
                    decoration: InputDecoration(
                      hintText: 'Type a message...',
                      filled: true,
                      fillColor: const Color(0xFFF7F8FA),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide.none,
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
                  backgroundColor: primary,
                  radius: 26,
                  child: IconButton(
                    tooltip: 'Send message',
                    onPressed: isSending ? null : _sendMessage,
                    icon: isSending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Icon(Icons.send_rounded, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ChatInitializationError extends StatelessWidget {
  const _ChatInitializationError({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.chat_bubble_outline_rounded,
                size: 52,
                color: Color(0xFF6B7280),
              ),
              const SizedBox(height: 16),
              const Text(
                'Conversation unavailable',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF6B7280), height: 1.4),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Try again'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MessagesLoadError extends StatelessWidget {
  const _MessagesLoadError();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline_rounded,
              size: 42,
              color: Color(0xFF6B7280),
            ),
            SizedBox(height: 12),
            Text(
              'Messages unavailable',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 6),
            Text(
              'We couldn\'t load this conversation. Please try again.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF6B7280)),
            ),
          ],
        ),
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
      final date = (createdAt as Timestamp).toDate().toLocal();

      final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
      final minute = date.minute.toString().padLeft(2, '0');
      final period = date.hour >= 12 ? 'PM' : 'AM';

      return '$hour:$minute $period';
    }

    return '';
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFB02F00);

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.72,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isMine ? primary : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(isMine ? 18 : 4),
            bottomRight: Radius.circular(isMine ? 4 : 18),
          ),
          border: isMine ? null : Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: isMine
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            Text(
              message,
              style: TextStyle(
                color: isMine ? Colors.white : Colors.black,
                height: 1.35,
              ),
            ),
            if (timeText.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                timeText,
                style: TextStyle(
                  color: isMine ? Colors.white70 : Colors.grey,
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
