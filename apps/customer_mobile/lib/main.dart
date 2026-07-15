import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app/app.dart';
import 'app/bootstrap.dart';

Future<void> main() async {
  try {
    await bootstrap();
  } catch (error, stackTrace) {
    debugPrint('Application startup failed: $error');
    debugPrintStack(stackTrace: stackTrace);
  }

  runApp(const FeastaApp());
}