import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class FeastaAdminTheme {
  FeastaAdminTheme._();

  static ThemeData get lightTheme {
    final baseTextTheme = ThemeData.light().textTheme;
    final poppinsTextTheme = GoogleFonts.poppinsTextTheme(baseTextTheme);

    return ThemeData(
      useMaterial3: true,
      fontFamily: GoogleFonts.poppins().fontFamily,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFFF6B00),
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xFFF8F9FB),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: Color(0xFFE9EDF3)),
        ),
      ),
      dividerColor: const Color(0xFFE9EDF3),
      textTheme: poppinsTextTheme.apply(
        bodyColor: const Color(0xFF111827),
        displayColor: const Color(0xFF111827),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Color(0xFF111827),
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
      ),
      iconTheme: const IconThemeData(color: Color(0xFF111827)),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      ),
    );
  }
}
