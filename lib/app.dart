import 'package:flutter/material.dart';

import 'screens/splash/splash_screen.dart';

class FeastaApp extends StatelessWidget {
  const FeastaApp({super.key});

  @override
  Widget build(BuildContext context) {
    const Color appBg = Color(0xFFF8F6F3);
    const Color appPrimary = Color(0xFFFF6333);
    const Color appSurface = Colors.white;
    const Color appText = Color(0xFF2B211D);
    const Color appTextSecondary = Color(0xFF8C817A);
    const Color appBorder = Color(0xFFE8E1DB);

    return MaterialApp(
      title: 'Feasta',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: appBg,
        colorScheme: ColorScheme.fromSeed(
          seedColor: appPrimary,
          primary: appPrimary,
          surface: appSurface,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFFFFF3EE),
          foregroundColor: appText,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: false,
          titleTextStyle: TextStyle(
            color: appText,
            fontSize: 24,
            fontWeight: FontWeight.w900,
          ),
          iconTheme: IconThemeData(
            color: appText,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          hintStyle: const TextStyle(
            color: appTextSecondary,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
          labelStyle: const TextStyle(
            color: appTextSecondary,
            fontWeight: FontWeight.w700,
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 15,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(
              color: appBorder,
            ),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(
              color: appPrimary,
              width: 1.3,
            ),
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(
              color: appBorder,
            ),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: appPrimary,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            textStyle: const TextStyle(
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: appPrimary,
            side: const BorderSide(
              color: appBorder,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            textStyle: const TextStyle(
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        cardTheme: CardThemeData(
          color: appSurface,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(22),
            side: const BorderSide(
              color: appBorder,
            ),
          ),
        ),
      ),
      home: const SplashScreen(),
    );
  }
}