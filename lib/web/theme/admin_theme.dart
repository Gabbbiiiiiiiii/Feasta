import 'package:flutter/material.dart';

class FeastaAdminTheme {
  FeastaAdminTheme._();

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFFF6333),
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xFFF6F7FB),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
      ),
    );
  }
}
