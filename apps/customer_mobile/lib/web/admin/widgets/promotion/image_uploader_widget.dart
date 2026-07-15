import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'image_picker_stub.dart' if (dart.library.html) 'image_picker_web.dart';

class ImageUploaderWidget extends StatefulWidget {
  const ImageUploaderWidget({super.key, this.initialUrl, this.onPicked});

  final String? initialUrl;
  final void Function(Uint8List?, String?)? onPicked;

  @override
  State<ImageUploaderWidget> createState() => _ImageUploaderWidgetState();
}

class _ImageUploaderWidgetState extends State<ImageUploaderWidget> {
  Uint8List? _bytes;
  String? _url;

  @override
  void initState() {
    super.initState();
    _url = widget.initialUrl;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_url != null)
          Image.network(_url!, width: double.infinity, height: 180, fit: BoxFit.cover)
        else if (_bytes != null)
          Image.memory(_bytes!, width: double.infinity, height: 180, fit: BoxFit.cover)
        else
          Container(width: double.infinity, height: 180, color: const Color(0xFFF4F4F4)),
        const SizedBox(height: 8),
        Row(children: [FilledButton.icon(onPressed: _pick, icon: const Icon(Icons.upload_file), label: const Text('Upload file')), const SizedBox(width: 12), Expanded(child: TextFormField(initialValue: _url, decoration: const InputDecoration(labelText: 'Image URL'), onChanged: (v) => _onUrlChanged(v)))]),
      ],
    );
  }

  void _onUrlChanged(String v) {
    setState(() => _url = v.trim().isEmpty ? null : v.trim());
    widget.onPicked?.call(_bytes, _url);
  }

  Future<void> _pick() async {
    try {
      final bytes = await pickImage();
      if (bytes != null) {
        setState(() {
          _bytes = bytes;
          _url = null;
        });
        widget.onPicked?.call(_bytes, _url);
      }
    } catch (_) {}
  }
}
