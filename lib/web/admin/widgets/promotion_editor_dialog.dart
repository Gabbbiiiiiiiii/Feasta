import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../models/promotion_model.dart';
import '../../../services/promotion_service.dart';
import 'image_uploader_widget.dart';

class PromotionEditorDialog extends StatefulWidget {
  const PromotionEditorDialog({super.key, this.promotion, this.service});

  final PromotionModel? promotion;
  final PromotionService? service;

  static Future<void> show(BuildContext context, {PromotionModel? promotion, PromotionService? service}) async {
    await showDialog(context: context, builder: (_) => Dialog(child: SizedBox(width: 720, height: 640, child: PromotionEditorDialog(promotion: promotion, service: service))));
  }

  @override
  State<PromotionEditorDialog> createState() => _PromotionEditorDialogState();
}

class _PromotionEditorDialogState extends State<PromotionEditorDialog> {
  late final PromotionService _service = widget.service ?? PromotionService();

  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _subtitle = TextEditingController();
  final _description = TextEditingController();
  final _button = TextEditingController();
  final _link = TextEditingController();
  final _order = TextEditingController();
  DateTime? _start;
  DateTime? _end;
  Uint8List? _imageBytes;
  String? _imageUrl;
  bool _isActive = true;
  bool _isFeatured = false;
  bool _isSponsored = false;
  String _promotionType = '';

  @override
  void initState() {
    super.initState();
    final p = widget.promotion;
    if (p != null) {
      _title.text = p.title;
      _subtitle.text = p.subtitle ?? '';
      _description.text = p.description;
      _button.text = p.buttonText;
      _link.text = p.linkUrl ?? '';
      _order.text = p.order.toString();
      _start = p.startDate;
      _end = p.endDate;
      _imageUrl = p.imageUrl;
      _isActive = p.isActive;
      _isFeatured = p.isFeatured;
      _isSponsored = p.isSponsored;
      _promotionType = p.promotionType;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            Row(children: [Expanded(child: Text(widget.promotion == null ? 'Create Promotion' : 'Edit Promotion', style: Theme.of(context).textTheme.headlineSmall)), IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close))]),
            const SizedBox(height: 8),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    TextFormField(controller: _title, decoration: const InputDecoration(labelText: 'Title'), validator: (v) => (v ?? '').trim().isEmpty ? 'Required' : null),
                    const SizedBox(height: 8),
                    TextFormField(controller: _subtitle, decoration: const InputDecoration(labelText: 'Subtitle')),
                    const SizedBox(height: 8),
                    TextFormField(controller: _description, decoration: const InputDecoration(labelText: 'Description'), maxLines: 3, validator: (v) => (v ?? '').trim().isEmpty ? 'Required' : null),
                    const SizedBox(height: 8),
                    Row(children: [Expanded(child: TextFormField(controller: _button, decoration: const InputDecoration(labelText: 'Button Text'))), const SizedBox(width: 12), Expanded(child: TextFormField(controller: _link, decoration: const InputDecoration(labelText: 'Link URL')))]),
                    const SizedBox(height: 8),
                    Row(children: [Expanded(child: TextFormField(controller: _order, decoration: const InputDecoration(labelText: 'Priority'), keyboardType: TextInputType.number)), const SizedBox(width: 12), Expanded(child: DropdownButtonFormField<String>(value: _promotionType.isEmpty ? null : _promotionType, decoration: const InputDecoration(labelText: 'Promotion Type'), items: const [DropdownMenuItem(value: 'featured_provider', child: Text('Featured Provider')), DropdownMenuItem(value: 'birthday', child: Text('Birthday')), DropdownMenuItem(value: 'wedding', child: Text('Wedding')), DropdownMenuItem(value: 'fiesta', child: Text('Fiesta')), DropdownMenuItem(value: 'corporate', child: Text('Corporate')), DropdownMenuItem(value: 'graduation', child: Text('Graduation')), DropdownMenuItem(value: 'limited_time', child: Text('Limited Time')), DropdownMenuItem(value: 'early_booking', child: Text('Early Booking'))], onChanged: (v) => setState(() => _promotionType = v ?? '')))]),
                    const SizedBox(height: 8),
                    Row(children: [Text(_start != null ? '${_start!.toLocal()}'.split(' ')[0] : 'Start date'), const SizedBox(width: 8), FilledButton(onPressed: () async { final d = await showDatePicker(context: context, initialDate: _start ?? DateTime.now(), firstDate: DateTime(2000), lastDate: DateTime(2100)); if (d != null) setState(() => _start = d); }, child: const Text('Pick')) , const SizedBox(width: 12), Text(_end != null ? '${_end!.toLocal()}'.split(' ')[0] : 'End date'), const SizedBox(width: 8), FilledButton(onPressed: () async { final d = await showDatePicker(context: context, initialDate: _end ?? DateTime.now(), firstDate: DateTime(2000), lastDate: DateTime(2100)); if (d != null) setState(() => _end = d); }, child: const Text('Pick'))]),
                    const SizedBox(height: 8),
                    ImageUploaderWidget(initialUrl: _imageUrl, onPicked: (bytes, url) => setState(() { _imageBytes = bytes; if (url != null) _imageUrl = url; })),
                    const SizedBox(height: 16),
                    Row(children: [SwitchListTile(value: _isActive, onChanged: (v) => setState(() => _isActive = v), title: const Text('Active'), contentPadding: EdgeInsets.zero), const SizedBox(width: 12), SwitchListTile(value: _isFeatured, onChanged: (v) => setState(() => _isFeatured = v), title: const Text('Featured'), contentPadding: EdgeInsets.zero), const SizedBox(width: 12), SwitchListTile(value: _isSponsored, onChanged: (v) => setState(() => _isSponsored = v), title: const Text('Sponsored'), contentPadding: EdgeInsets.zero)]),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')), const SizedBox(width: 8), FilledButton(onPressed: _save, child: Text(widget.promotion == null ? 'Create' : 'Save'))]),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final title = _title.text.trim();
    final description = _description.text.trim();
    final button = _button.text.trim();
    final link = _link.text.trim();
    final order = int.tryParse(_order.text.trim()) ?? 0;

    try {
      if (widget.promotion == null) {
        await _service.createPromotion(
          title: title,
          description: description,
          imageUrl: _imageUrl,
          imageBytes: _imageBytes,
          linkUrl: link.isEmpty ? null : link,
          buttonText: button.isEmpty ? null : button,
          startDate: _start,
          endDate: _end,
          order: order,
          isActive: _isActive,
          isFeatured: _isFeatured,
          isSponsored: _isSponsored,
          promotionType: _promotionType,
          subtitle: _subtitle.text.trim().isEmpty ? null : _subtitle.text.trim(),
        );
      } else {
        await _service.updatePromotion(
          id: widget.promotion!.id,
          title: title,
          description: description,
          imageUrl: _imageUrl,
          imageBytes: _imageBytes,
          linkUrl: link.isEmpty ? null : link,
          buttonText: button.isEmpty ? null : button,
          startDate: _start,
          endDate: _end,
          order: order,
          isActive: _isActive,
          isFeatured: _isFeatured,
          isSponsored: _isSponsored,
          promotionType: _promotionType,
          subtitle: _subtitle.text.trim().isEmpty ? null : _subtitle.text.trim(),
        );
      }

      if (context.mounted) Navigator.pop(context);
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }
}
