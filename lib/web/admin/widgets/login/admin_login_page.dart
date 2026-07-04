import 'package:flutter/material.dart';
import 'package:feasta/web/admin/widgets/common/fade_in.dart';

import 'login_left_panel.dart';
import 'login_right_panel.dart';

class AdminLoginPage extends StatelessWidget {
  const AdminLoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    final isDesktop = width >= 900;

    return Scaffold(
      body: FadeIn(
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 400),
          child: isDesktop
              ? Row(
                  children: const [
                    Expanded(flex: 5, child: LoginLeftPanel()),
                    Expanded(flex: 4, child: LoginRightPanel()),
                  ],
                )
              : const Center(
                  child: SingleChildScrollView(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: LoginRightPanel(),
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}