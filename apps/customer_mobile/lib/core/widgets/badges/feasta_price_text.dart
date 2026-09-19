import 'package:flutter/material.dart';

import '../../theme/app_typography.dart';

abstract final class FeastaPriceFormatter {
  static String format(
    num amount, {
    String symbol = '\u20B1',
    int decimalDigits = 2,
  }) {
    final fixed = amount.abs().toStringAsFixed(decimalDigits);
    final parts = fixed.split('.');
    final digits = parts.first;
    final grouped = StringBuffer();
    for (var index = 0; index < digits.length; index++) {
      if (index > 0 && (digits.length - index) % 3 == 0) grouped.write(',');
      grouped.write(digits[index]);
    }
    final decimals = decimalDigits == 0 ? '' : '.${parts.last}';
    final sign = amount < 0 ? '-' : '';
    return '$sign$symbol${grouped.toString()}$decimals';
  }
}

class FeastaPriceText extends StatelessWidget {
  const FeastaPriceText({
    required this.amount,
    this.symbol = '\u20B1',
    this.decimalDigits = 2,
    this.style,
    this.semanticLabel,
    super.key,
  });

  final num amount;
  final String symbol;
  final int decimalDigits;
  final TextStyle? style;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final formatted = FeastaPriceFormatter.format(
      amount,
      symbol: symbol,
      decimalDigits: decimalDigits,
    );
    return Semantics(
      label: semanticLabel ?? 'Price: $formatted',
      excludeSemantics: true,
      child: Text(
        formatted,
        style: style ?? AppTypography.title,
        softWrap: true,
      ),
    );
  }
}
