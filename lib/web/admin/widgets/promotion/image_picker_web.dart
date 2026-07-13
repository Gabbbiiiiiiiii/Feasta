import 'dart:async';
import 'dart:html' as html;
import 'dart:typed_data';

Future<Uint8List?> pickImage() async {
  final input = html.FileUploadInputElement();
  input.accept = 'image/*';
  input.click();

  final completer = Completer<Uint8List?>();

  input.onChange.listen((_) {
    final file = input.files?.first;
    if (file == null) {
      completer.complete(null);
      return;
    }

    final reader = html.FileReader();
    reader.readAsArrayBuffer(file);
    reader.onLoad.first.then((_) {
      final data = reader.result as ByteBuffer;
      completer.complete(Uint8List.view(data));
    });
  });

  return completer.future;
}
