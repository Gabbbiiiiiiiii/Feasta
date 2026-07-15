import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../constants/status_constants.dart';
import '../../../shared/models/feasta_models.dart';
import '../../../features/authentication/data/repositories/feasta_repository.dart';
import '../../../shared/widgets/loading_skeleton.dart';

class ChatScreen extends StatefulWidget {
  final BookingModel booking;
  final String currentRole;

  const ChatScreen({
    super.key,
    required this.booking,
    required this.currentRole,
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
    final id = await repository.createChatRoom(
      booking: widget.booking,
    );

    await repository.markChatAsRead(
      chatRoomId: id,
      currentRole: widget.currentRole,
    );

    if (!mounted) return;

    setState(() {
      chatRoomId = id;
    });
  }

  Future<void> _sendMessage() async {
    final message = messageController.text.trim();

    if (message.isEmpty || chatRoomId == null) return;

    setState(() => isSending = true);

    try {
      await repository.sendMessage(
        chatRoomId: chatRoomId!,
        senderRole: widget.currentRole,
        message: message,
      );

      messageController.clear();
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => isSending = false);
      }
    }
  }

  String get chatTitle {
    if (widget.currentRole == UserRoles.customer) {
      return widget.booking.providerBusinessName;
    }

    return '${widget.booking.customerFirstName} ${widget.booking.customerLastName}';
  }

  @override
  void dispose() {
    messageController.dispose();

    if (chatRoomId != null) {
      repository.markChatAsRead(
        chatRoomId: chatRoomId!,
        currentRole: widget.currentRole,
      );
    }

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          chatTitle,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: chatRoomId == null
          ? const FeastaSkeletonChat()
          : Column(
              children: [
                Expanded(
                  child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    stream: repository.chatMessages(chatRoomId!),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const FeastaSkeletonChat();
                      }

                      final messages = snapshot.data?.docs ?? [];

                      if (messages.isEmpty) {
                        return const Center(
                          child: Text(
                            'No messages yet. Start the conversation.',
                            style: TextStyle(color: Colors.grey),
                          ),
                        );
                      }

                      return ListView.builder(
                        reverse: true,
                        padding: const EdgeInsets.all(16),
                        itemCount: messages.length,
                        itemBuilder: (context, index) {
                          final data = messages[index].data();

                          final senderId = data['senderId'] ?? '';
                          final senderRole = data['senderRole'] ?? '';
                          final message = data['message'] ?? '';
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
                    border: Border(
                      top: BorderSide(color: Color(0xFFE5E7EB)),
                    ),
                  ),
                  child: SafeArea(
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: messageController,
                            minLines: 1,
                            maxLines: 4,
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
                                : const Icon(
                                    Icons.send,
                                    color: Colors.white,
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
    const primary = Color(0xFFFF6333);

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.72,
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 10,
        ),
        decoration: BoxDecoration(
          color: isMine ? primary : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(isMine ? 18 : 4),
            bottomRight: Radius.circular(isMine ? 4 : 18),
          ),
          border: isMine
              ? null
              : Border.all(
                  color: const Color(0xFFE5E7EB),
                ),
        ),
        child: Column(
          crossAxisAlignment:
              isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
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
