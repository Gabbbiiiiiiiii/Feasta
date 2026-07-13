import 'package:flutter/material.dart';

class AdminNotesCard extends StatefulWidget {
  final String initialNotes;
  final bool isSaving;
  final ValueChanged<String> onSave;

  const AdminNotesCard({
    super.key,
    required this.initialNotes,
    required this.onSave,
    this.isSaving = false,
  });

  @override
  State<AdminNotesCard> createState() => _AdminNotesCardState();
}

class _AdminNotesCardState extends State<AdminNotesCard> {
  late final TextEditingController _controller;

  bool get _hasChanges {
    return _controller.text.trim() != widget.initialNotes.trim();
  }

  bool get _canSave {
    return !widget.isSaving &&
        _hasChanges &&
        _controller.text.trim().length <= 1000;
  }

  @override
  void initState() {
    super.initState();

    _controller = TextEditingController(
      text: widget.initialNotes,
    );

    _controller.addListener(_handleTextChanged);
  }

  @override
  void didUpdateWidget(covariant AdminNotesCard oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.initialNotes != widget.initialNotes &&
        !_hasChanges) {
      _controller.text = widget.initialNotes;
    }
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_handleTextChanged)
      ..dispose();

    super.dispose();
  }

  void _handleTextChanged() {
    setState(() {});
  }

  void _save() {
    if (!_canSave) {
      return;
    }

    widget.onSave(_controller.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(
                Icons.sticky_note_2_outlined,
                size: 19,
                color: Color(0xFF374151),
              ),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Internal Admin Notes',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                  ),
                ),
              ),
              _PrivateBadge(),
            ],
          ),
          const SizedBox(height: 7),
          const Text(
            'These notes are visible only to administrators.',
            style: TextStyle(
              color: Color(0xFF6B7280),
              fontSize: 11.5,
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _controller,
            enabled: !widget.isSaving,
            minLines: 4,
            maxLines: 7,
            maxLength: 1000,
            decoration: InputDecoration(
              hintText:
                  'Add review notes, document concerns, or follow-up instructions.',
              alignLabelWithHint: true,
              filled: true,
              fillColor: const Color(0xFFFFFBEB),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(11),
                borderSide: const BorderSide(
                  color: Color(0xFFFDE68A),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(11),
                borderSide: const BorderSide(
                  color: Color(0xFFFDE68A),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(11),
                borderSide: const BorderSide(
                  color: Color(0xFFD97706),
                  width: 1.4,
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              if (_hasChanges)
                const Expanded(
                  child: Text(
                    'You have unsaved changes.',
                    style: TextStyle(
                      color: Color(0xFFD97706),
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                )
              else
                const Spacer(),
              FilledButton.icon(
                onPressed: _canSave ? _save : null,
                icon: widget.isSaving
                    ? const SizedBox(
                        width: 15,
                        height: 15,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(
                        Icons.save_outlined,
                        size: 17,
                      ),
                label: Text(
                  widget.isSaving ? 'Saving' : 'Save Notes',
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFFF6333),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor:
                      const Color(0xFFF3F4F6),
                  disabledForegroundColor:
                      const Color(0xFF9CA3AF),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 15,
                    vertical: 13,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(9),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PrivateBadge extends StatelessWidget {
  const _PrivateBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(7),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.lock_outline_rounded,
            size: 12,
            color: Color(0xFF6B7280),
          ),
          SizedBox(width: 4),
          Text(
            'Private',
            style: TextStyle(
              color: Color(0xFF6B7280),
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}