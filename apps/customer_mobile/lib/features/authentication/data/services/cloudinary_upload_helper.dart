import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

class CloudinaryUploadHelper {
  static const String cloudName = 'do1vvlekz';
  static const String uploadPreset = 'feasta_verification_upload';

  static Future<String> uploadFile({
    required Uint8List fileBytes,
    required String fileName,
  }) async {
    final url = Uri.parse('https://api.cloudinary.com/v1_1/$cloudName/auto/upload');
    final request = http.MultipartRequest('POST', url);

    request.fields['upload_preset'] = uploadPreset;
    request.fields['folder'] = 'feasta_promotions';

    request.files.add(
      http.MultipartFile.fromBytes(
        'file',
        fileBytes,
        filename: fileName,
      ),
    );

    final response = await request.send();
    final responseBody = await response.stream.bytesToString();

    if (response.statusCode == 200) {
      final data = jsonDecode(responseBody);
      return data['secure_url'].toString();
    }

    throw Exception('Cloudinary upload failed: $responseBody');
  }
}
