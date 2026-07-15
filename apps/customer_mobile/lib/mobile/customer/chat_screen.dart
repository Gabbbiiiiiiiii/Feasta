import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';

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
    try {
      final id = await repository.createChatRoom(
        booking: widget.booking,
      );

      if (!mounted) return;

      setState(() {
        chatRoomId = id;
      });

      await repository.markChatAsRead(
        chatRoomId: id,
        currentRole: widget.currentRole,
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    }
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

  String get screenTitle {
    if (widget.currentRole == UserRoles.customer) {
      return widget.booking.providerBusinessName;
    }

    return '${widget.booking.customerFirstName} ${widget.booking.customerLastName}';
  }

  @override
  void dispose() {
    messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          screenTitle,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: chatRoomId == null
          ? const FeastaSkeletonChat()
          : Column(
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: const BoxDecoration(
                    color: Color(0xFFFFF3EE),
                    border: Border(
                      bottom: BorderSide(color: Color(0xFFE5E7EB)),
                    ),
                  ),
                  child: Text(
                    'Booking: ${widget.booking.packageName}',
                    style: const TextStyle(
                      color: primary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Expanded(
                  child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    stream: repository.chatMessages(chatRoomId!),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const FeastaSkeletonChat();
                      }

                      if (snapshot.hasError) {
                        return Center(
                          child: Text('Error: ${snapshot.error}'),
                        );
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

                          final isMe = senderId == repository.currentUid;

                          return ChatBubble(
                            message: message,
                            senderRole: senderRole,
                            isMe: isMe,
                            createdAt: createdAt,
                          );
                        },
                      );
                    },
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      border: Border(
                        top: BorderSide(color: Color(0xFFE5E7EB)),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: messageController,
                            minLines: 1,
                            maxLines: 4,
                            decoration: InputDecoration(
                              hintText: 'Type your message...',
                              filled: true,
                              fillColor: const Color(0xFFF7F8FA),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(18),
                                borderSide: BorderSide.none,
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        CircleAvatar(
                          backgroundColor: primary,
                          child: IconButton(
                            onPressed: isSending ? null : _sendMessage,
                            icon: isSending
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
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
  final bool isMe;
  final dynamic createdAt;

  const ChatBubble({
    super.key,
    required this.message,
    required this.senderRole,
    required this.isMe,
    required this.createdAt,
  });

  String get formattedTime {
    if (createdAt is Timestamp) {
      final date = createdAt.toDate();
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
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isMe ? primary : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(isMe ? 18 : 4),
            bottomRight: Radius.circular(isMe ? 4 : 18),
          ),
          border: isMe
              ? null
              : Border.all(
                  color: const Color(0xFFE5E7EB),
                ),
        ),
        child: Column(
          crossAxisAlignment:
              isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              message,
              style: TextStyle(
                color: isMe ? Colors.white : Colors.black87,
                height: 1.35,
              ),
            ),
            if (formattedTime.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                formattedTime,
                style: TextStyle(
                  color: isMe ? Colors.white70 : Colors.grey,
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
