import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/app_sizes.dart';

class FeastaTextField extends StatefulWidget {
  const FeastaTextField({
    required this.label,
    this.controller,
    this.initialValue,
    this.focusNode,
    this.nextFocusNode,
    this.hintText,
    this.helperText,
    this.errorText,
    this.isRequired = false,
    this.isPassword = false,
    this.enabled = true,
    this.readOnly = false,
    this.prefixIcon,
    this.suffixIcon,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.onChanged,
    this.onSubmitted,
    this.validator,
    this.semanticLabel,
    this.maxLines = 1,
    this.minLines,
    this.maxLength,
    this.autocorrect = true,
    this.enableSuggestions = true,
    this.inputFormatters,
    super.key,
  }) : assert(controller == null || initialValue == null),
       assert(!isPassword || maxLines == 1);

  final String label;
  final TextEditingController? controller;
  final String? initialValue;
  final FocusNode? focusNode;
  final FocusNode? nextFocusNode;
  final String? hintText;
  final String? helperText;
  final String? errorText;
  final bool isRequired;
  final bool isPassword;
  final bool enabled;
  final bool readOnly;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final FormFieldValidator<String>? validator;
  final String? semanticLabel;
  final int? maxLines;
  final int? minLines;
  final int? maxLength;
  final bool autocorrect;
  final bool enableSuggestions;
  final List<TextInputFormatter>? inputFormatters;

  @override
  State<FeastaTextField> createState() => _FeastaTextFieldState();
}

class _FeastaTextFieldState extends State<FeastaTextField> {
  late bool _obscureText;

  @override
  void initState() {
    super.initState();
    _obscureText = widget.isPassword;
  }

  @override
  void didUpdateWidget(FeastaTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isPassword != widget.isPassword) {
      _obscureText = widget.isPassword;
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = widget.isRequired ? '${widget.label} *' : widget.label;
    final accessibleLabel =
        widget.semanticLabel ??
        (widget.isRequired ? '${widget.label}, required' : widget.label);
    final accessibleHint = widget.errorText == null
        ? widget.helperText
        : 'Error: ${widget.errorText}';
    final passwordToggle = widget.isPassword
        ? IconButton(
            tooltip: _obscureText ? 'Show password' : 'Hide password',
            onPressed: widget.enabled && !widget.readOnly
                ? () => setState(() => _obscureText = !_obscureText)
                : null,
            icon: Icon(
              _obscureText
                  ? Icons.visibility_outlined
                  : Icons.visibility_off_outlined,
            ),
          )
        : null;

    return Semantics(
      container: true,
      liveRegion: widget.errorText != null,
      label: accessibleLabel,
      hint: accessibleHint,
      textField: true,
      enabled: widget.enabled,
      readOnly: widget.readOnly,
      child: TextFormField(
        controller: widget.controller,
        initialValue: widget.initialValue,
        focusNode: widget.focusNode,
        enabled: widget.enabled,
        readOnly: widget.readOnly,
        obscureText: _obscureText,
        keyboardType: widget.keyboardType,
        textInputAction: widget.textInputAction,
        autofillHints: widget.autofillHints,
        onChanged: widget.onChanged,
        onFieldSubmitted: (value) {
          widget.onSubmitted?.call(value);
          if (widget.nextFocusNode != null) {
            widget.nextFocusNode!.requestFocus();
          }
        },
        validator: widget.validator,
        maxLines: widget.maxLines,
        minLines: widget.minLines,
        maxLength: widget.maxLength,
        autocorrect: widget.isPassword ? false : widget.autocorrect,
        enableSuggestions: widget.isPassword ? false : widget.enableSuggestions,
        inputFormatters: widget.inputFormatters,
        decoration: InputDecoration(
          labelText: label,
          hintText: widget.hintText,
          helperText: widget.helperText,
          errorText: widget.errorText,
          prefixIcon: widget.prefixIcon == null
              ? null
              : IconTheme.merge(
                  data: const IconThemeData(size: AppSizes.iconDefault),
                  child: widget.prefixIcon!,
                ),
          suffixIcon: passwordToggle ?? widget.suffixIcon,
        ),
      ),
    );
  }
}

class FeastaSearchField extends StatelessWidget {
  const FeastaSearchField({
    required this.label,
    this.controller,
    this.focusNode,
    this.hintText,
    this.onChanged,
    this.onSubmitted,
    this.onClear,
    this.enabled = true,
    this.autofocus = false,
    super.key,
  });

  final String label;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final String? hintText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onClear;
  final bool enabled;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      textField: true,
      label: label,
      enabled: enabled,
      child: TextFormField(
        controller: controller,
        focusNode: focusNode,
        autofocus: autofocus,
        enabled: enabled,
        keyboardType: TextInputType.text,
        textInputAction: TextInputAction.search,
        onChanged: onChanged,
        onFieldSubmitted: onSubmitted,
        decoration: InputDecoration(
          labelText: label,
          hintText: hintText,
          prefixIcon: const Icon(Icons.search),
          suffixIcon: onClear == null
              ? null
              : IconButton(
                  tooltip: 'Clear search',
                  onPressed: enabled ? onClear : null,
                  icon: const Icon(Icons.close),
                ),
        ),
      ),
    );
  }
}
