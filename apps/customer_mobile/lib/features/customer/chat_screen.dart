import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_shadows.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../authentication/data/repositories/feasta_repository.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    required this.booking,
    required this.currentRole,
    super.key,
  });

  final BookingModel booking;
  final String currentRole;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final FeastaRepository repository = FeastaRepository();

  final TextEditingController messageController = TextEditingController();

  final ScrollController scrollController = ScrollController();

  bool isSending = false;
  bool isPreparingRoom = true;

  String? chatRoomId;
  String? initializationError;

  @override
  void initState() {
    super.initState();

    messageController.addListener(_handleComposerChanged);

    _prepareChatRoom();
  }

  @override
  void dispose() {
    messageController.removeListener(_handleComposerChanged);

    messageController.dispose();
    scrollController.dispose();

    super.dispose();
  }

  void _handleComposerChanged() {
    if (!mounted) {
      return;
    }

    setState(() {});
  }

  String get screenTitle {
    if (widget.currentRole == UserRoles.customer) {
      final providerName = widget.booking.providerBusinessName.trim();

      return providerName.isEmpty ? 'Caterer' : providerName;
    }

    final customerName = [
      widget.booking.customerFirstName.trim(),
      widget.booking.customerLastName.trim(),
    ].where((value) => value.isNotEmpty).join(' ');

    return customerName.isEmpty ? 'Customer' : customerName;
  }

  String get subtitle {
    final packageName = widget.booking.packageName.trim();

    if (packageName.isNotEmpty) {
      return packageName;
    }

    final eventType = widget.booking.eventType.trim();

    if (eventType.isNotEmpty) {
      return eventType;
    }

    return 'Booking conversation';
  }

  bool get canSend {
    return !isSending &&
        chatRoomId != null &&
        messageController.text.trim().isNotEmpty;
  }

  Future<void> _prepareChatRoom() async {
    if (mounted) {
      setState(() {
        isPreparingRoom = true;
        initializationError = null;
      });
    }

    try {
      final id = await repository.createChatRoom(booking: widget.booking);

      if (!mounted) {
        return;
      }

      setState(() {
        chatRoomId = id;
        isPreparingRoom = false;
      });

      await repository.markChatAsRead(
        chatRoomId: id,
        currentRole: widget.currentRole,
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        isPreparingRoom = false;
        initializationError = error.toString().replaceAll('Exception: ', '');
      });
    }
  }

  Future<void> _markRoomAsRead() async {
    final roomId = chatRoomId;

    if (roomId == null) {
      return;
    }

    try {
      await repository.markChatAsRead(
        chatRoomId: roomId,
        currentRole: widget.currentRole,
      );
    } catch (_) {
      // Read-state failures should not block chat.
    }
  }

  Future<void> _sendMessage() async {
    final roomId = chatRoomId;

    final message = messageController.text.trim();

    if (roomId == null || message.isEmpty || isSending) {
      return;
    }

    setState(() {
      isSending = true;
    });

    try {
      await repository.sendMessage(
        chatRoomId: roomId,
        senderRole: widget.currentRole,
        message: message,
      );

      if (!mounted) {
        return;
      }

      messageController.clear();

      await _markRoomAsRead();
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showMessage(error.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() {
          isSending = false;
        });
      }
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: true,
      appBar: _ConversationAppBar(title: screenTitle, subtitle: subtitle),
      body: isPreparingRoom
          ? const FeastaSkeletonChat()
          : initializationError != null
          ? _ChatInitializationError(
              message: initializationError!,
              onRetry: _prepareChatRoom,
            )
          : _buildConversation(),
    );
  }

  Widget _buildConversation() {
    final roomId = chatRoomId;

    if (roomId == null) {
      return _ChatInitializationError(
        message: 'The conversation could not be prepared.',
        onRetry: _prepareChatRoom,
      );
    }

    return Column(
      children: [
        _BookingContextCard(booking: widget.booking),
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: repository.chatMessages(roomId),
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
                return _ConversationEmptyState(recipientName: screenTitle);
              }

              WidgetsBinding.instance.addPostFrameCallback((_) {
                _markRoomAsRead();
              });

              return ListView.builder(
                controller: scrollController,
                reverse: true,
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screen,
                  AppSpacing.lg,
                  AppSpacing.screen,
                  AppSpacing.xl,
                ),
                itemCount: messages.length,
                itemBuilder: (context, index) {
                  final document = messages[index];

                  final data = document.data();

                  final senderId = data['senderId']?.toString() ?? '';

                  final senderRole = data['senderRole']?.toString() ?? '';

                  final message = data['message']?.toString() ?? '';

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
        _MessageComposer(
          controller: messageController,
          isSending: isSending,
          canSend: canSend,
          onSend: _sendMessage,
        ),
      ],
    );
  }
}

class _ConversationAppBar extends StatelessWidget
    implements PreferredSizeWidget {
  const _ConversationAppBar({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Size get preferredSize => const Size.fromHeight(72);

  @override
  Widget build(BuildContext context) {
    final largeText = MediaQuery.textScalerOf(context).scale(16) >= 22;

    return AppBar(
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      toolbarHeight: 72,
      leading: IconButton(
        tooltip: 'Back',
        onPressed: () {
          Navigator.pop(context);
        },
        icon: const Icon(Icons.arrow_back_rounded, color: AppColors.mainText),
      ),
      titleSpacing: AppSpacing.xs,
      title: Row(
        children: [
          _ConversationAvatar(name: title),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  title,
                  maxLines: largeText ? 2 : 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (!largeText) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.caption.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      bottom: const PreferredSize(
        preferredSize: Size.fromHeight(1),
        child: Divider(height: 1, color: AppColors.border),
      ),
    );
  }
}

class _ConversationAvatar extends StatelessWidget {
  const _ConversationAvatar({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: AppColors.primarySubtle,
        shape: BoxShape.circle,
      ),
      child: Text(
        _initials(name),
        style: AppTypography.label.copyWith(
          color: AppColors.primaryStrong,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }

  String _initials(String value) {
    final words = value
        .trim()
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .toList();

    if (words.isEmpty) {
      return 'F';
    }

    if (words.length == 1) {
      return words.first[0].toUpperCase();
    }

    return '${words.first[0]}'
            '${words.last[0]}'
        .toUpperCase();
  }
}

class _BookingContextCard extends StatelessWidget {
  const _BookingContextCard({required this.booking});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    final packageName = booking.packageName.trim();

    final bookingCode = booking.bookingCode.trim();

    return Container(
      width: double.infinity,
      color: AppColors.surface,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.sm,
      ),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: AppColors.primarySubtle,
          borderRadius: BorderRadius.circular(AppRadius.large),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: AppColors.surface,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.event_note_outlined,
                color: AppColors.primaryStrong,
                size: 20,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    packageName.isEmpty ? 'Booking conversation' : packageName,
                    style: AppTypography.label.copyWith(
                      color: AppColors.mainText,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  if (bookingCode.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      bookingCode,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConversationEmptyState extends StatelessWidget {
  const _ConversationEmptyState({required this.recipientName});

  final String recipientName;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 340),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 88,
                height: 88,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  shape: BoxShape.circle,
                  boxShadow: AppShadows.card,
                ),
                child: const Icon(
                  Icons.chat_bubble_outline_rounded,
                  size: 40,
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                'Start the conversation',
                textAlign: TextAlign.center,
                style: AppTypography.title.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Send a message to $recipientName about this booking.',
                textAlign: TextAlign.center,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  height: 1.45,
                ),
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
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: AppColors.errorSubtle,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.error_outline_rounded,
                color: AppColors.error,
                size: 32,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'Messages unavailable',
              textAlign: TextAlign.center,
              style: AppTypography.cardTitle.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'We couldn\'t load this conversation right now.',
              textAlign: TextAlign.center,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatInitializationError extends StatelessWidget {
  const _ChatInitializationError({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 82,
                height: 82,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.errorSubtle,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.sms_failed_outlined,
                  color: AppColors.error,
                  size: 36,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                'Conversation unavailable',
                textAlign: TextAlign.center,
                style: AppTypography.title.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                message,
                textAlign: TextAlign.center,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              FilledButton.icon(
                onPressed: onRetry,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg,
                    vertical: AppSpacing.sm,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppRadius.large),
                  ),
                ),
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

class _MessageComposer extends StatelessWidget {
  const _MessageComposer({
    required this.controller,
    required this.isSending,
    required this.canSend,
    required this.onSend,
  });

  final TextEditingController controller;

  final bool isSending;
  final bool canSend;

  final Future<void> Function() onSend;

  @override
  Widget build(BuildContext context) {
    final largeText = MediaQuery.textScalerOf(context).scale(16) >= 22;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.border)),
        boxShadow: AppShadows.navigation,
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.md,
      ),
      child: SafeArea(
        top: false,
        child: largeText
            ? Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _ComposerTextField(
                    controller: controller,
                    onSubmitted: onSend,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _SendButton(
                    isSending: isSending,
                    canSend: canSend,
                    onPressed: onSend,
                    expanded: true,
                  ),
                ],
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: _ComposerTextField(
                      controller: controller,
                      onSubmitted: onSend,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  _SendButton(
                    isSending: isSending,
                    canSend: canSend,
                    onPressed: onSend,
                    expanded: false,
                  ),
                ],
              ),
      ),
    );
  }
}

class _ComposerTextField extends StatelessWidget {
  const _ComposerTextField({
    required this.controller,
    required this.onSubmitted,
  });

  final TextEditingController controller;

  final Future<void> Function() onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      minLines: 1,
      maxLines: 5,
      keyboardType: TextInputType.multiline,
      textCapitalization: TextCapitalization.sentences,
      decoration: InputDecoration(
        hintText: 'Message...',
        hintStyle: AppTypography.body.copyWith(
          color: AppColors.secondaryTextAccessible,
        ),
        filled: true,
        fillColor: AppColors.surfaceMuted,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.large),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.large),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
      onSubmitted: (_) {
        if (controller.text.trim().isNotEmpty) {
          onSubmitted();
        }
      },
    );
  }
}

class _SendButton extends StatelessWidget {
  const _SendButton({
    required this.isSending,
    required this.canSend,
    required this.onPressed,
    required this.expanded,
  });

  final bool isSending;
  final bool canSend;
  final bool expanded;

  final Future<void> Function() onPressed;

  @override
  Widget build(BuildContext context) {
    final button = Material(
      color: canSend ? AppColors.primary : AppColors.surfaceMuted,
      borderRadius: BorderRadius.circular(
        expanded ? AppRadius.large : AppRadius.pill,
      ),
      child: InkWell(
        onTap: canSend
            ? () {
                onPressed();
              }
            : null,
        borderRadius: BorderRadius.circular(
          expanded ? AppRadius.large : AppRadius.pill,
        ),
        child: SizedBox(
          width: expanded ? double.infinity : 52,
          height: 52,
          child: Center(
            child: isSending
                ? const SizedBox(
                    width: 19,
                    height: 19,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : expanded
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.send_rounded,
                        color: canSend
                            ? Colors.white
                            : AppColors.secondaryTextAccessible,
                        size: 20,
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      Text(
                        'Send message',
                        style: AppTypography.button.copyWith(
                          color: canSend
                              ? Colors.white
                              : AppColors.secondaryTextAccessible,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  )
                : Icon(
                    Icons.send_rounded,
                    color: canSend
                        ? Colors.white
                        : AppColors.secondaryTextAccessible,
                    size: 21,
                  ),
          ),
        ),
      ),
    );

    return Semantics(
      button: true,
      enabled: canSend,
      label: 'Send message',
      child: button,
    );
  }
}

class ChatBubble extends StatelessWidget {
  const ChatBubble({
    required this.message,
    required this.senderRole,
    required this.isMe,
    required this.createdAt,
    super.key,
  });

  final String message;
  final String senderRole;
  final bool isMe;
  final dynamic createdAt;

  String get formattedTime {
    if (createdAt is! Timestamp) {
      return '';
    }

    final date = (createdAt as Timestamp).toDate().toLocal();

    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;

    final minute = date.minute.toString().padLeft(2, '0');

    final period = date.hour >= 12 ? 'PM' : 'AM';

    return '$hour:$minute $period';
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.sizeOf(context).width;

    final largeText = MediaQuery.textScalerOf(context).scale(16) >= 22;

    final maxBubbleWidth = largeText ? screenWidth * 0.86 : screenWidth * 0.76;

    return Semantics(
      container: true,
      label:
          '${isMe ? 'You' : senderRole}: $message'
          '${formattedTime.isEmpty ? '' : ', $formattedTime'}',
      child: Align(
        alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(maxWidth: maxBubbleWidth),
          margin: const EdgeInsets.only(bottom: AppSpacing.sm),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.sm,
            AppSpacing.md,
            AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: isMe ? AppColors.primary : AppColors.surface,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(AppRadius.large),
              topRight: const Radius.circular(AppRadius.large),
              bottomLeft: Radius.circular(
                isMe ? AppRadius.large : AppRadius.small,
              ),
              bottomRight: Radius.circular(
                isMe ? AppRadius.small : AppRadius.large,
              ),
            ),
            border: isMe ? null : Border.all(color: AppColors.border),
            boxShadow: isMe ? null : AppShadows.card,
          ),
          child: Column(
            crossAxisAlignment: isMe
                ? CrossAxisAlignment.end
                : CrossAxisAlignment.start,
            children: [
              Text(
                message,
                style: AppTypography.body.copyWith(
                  color: isMe ? Colors.white : AppColors.mainText,
                  height: 1.4,
                ),
              ),
              if (formattedTime.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  formattedTime,
                  style: AppTypography.caption.copyWith(
                    color: isMe
                        ? Colors.white70
                        : AppColors.secondaryTextAccessible,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
