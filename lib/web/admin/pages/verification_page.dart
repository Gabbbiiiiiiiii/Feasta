import 'package:flutter/material.dart';

import '../models/verification/provider_verification.dart';
import '../widgets/verification/provider_verification_list.dart';
import '../widgets/verification/provider_business_info.dart';
import '../widgets/verification/provider_summary_header.dart';
import '../widgets/verification/submitted_documents_card.dart';
import '../widgets/verification/verification_activity_history.dart';
import '../widgets/verification/verification_timeline.dart';
import '../widgets/verification/admin_notes_card.dart';
import '../widgets/verification/reject_provider_dialog.dart';

class VerificationPage extends StatefulWidget {
  const VerificationPage({super.key});

  @override
  State<VerificationPage> createState() => _VerificationPageState();
}

class _VerificationPageState extends State<VerificationPage> {
  static const Color _primaryColor = Color(0xFFFF6333);
  static const Color _pageBackgroundColor = Color(0xFFF8F9FB);
  static const Color _borderColor = Color(0xFFE5E7EB);
  static const Color _textColor = Color(0xFF111827);
  static const Color _secondaryTextColor = Color(0xFF6B7280);

  final TextEditingController _searchController = TextEditingController();

  VerificationFilter _selectedFilter = VerificationFilter.pending;
  String? _selectedApplicationId;
  bool _isProcessingAction = false;
  String? _processingDocumentId;
  String? _savingNotesApplicationId;

  Future<void> _saveAdminNotes({
    required ProviderVerificationApplication application,
    required String notes,
  }) async {
    if (_savingNotesApplicationId != null) {
      return;
    }

    setState(() {
      _savingNotesApplicationId = application.id;
    });

    try {
      await Future<void>.delayed(
        const Duration(milliseconds: 650),
      );

      if (!mounted) {
        return;
      }

      _showMessage(
        'Internal notes for ${application.businessName} are ready to be saved to Firestore.',
      );
    } finally {
      if (mounted) {
        setState(() {
          _savingNotesApplicationId = null;
        });
      }
    }
  }

  void _previewDocument(
    VerificationDocumentData document,
  ) {
    if (document.status == VerificationDocumentStatus.missing) {
      _showMessage('This document has not been uploaded.');
      return;
    }

    if (document.fileUrl?.trim().isEmpty ?? true) {
      _showMessage(
        'The document URL is not available yet.',
      );
      return;
    }

    _showMessage(
      'Document preview will open ${document.title}.',
    );
  }

  void _downloadDocument(
    VerificationDocumentData document,
  ) {
    if (document.status == VerificationDocumentStatus.missing) {
      _showMessage('This document has not been uploaded.');
      return;
    }

    if (document.fileUrl?.trim().isEmpty ?? true) {
      _showMessage(
        'The document download URL is not available yet.',
      );
      return;
    }

    _showMessage(
      'Downloading ${document.fileName}.',
    );
  }

  Future<void> _verifyDocument(
    VerificationDocumentData document,
  ) async {
    if (_processingDocumentId != null) {
      return;
    }

    setState(() {
      _processingDocumentId = document.id;
    });

    try {
      await Future<void>.delayed(
        const Duration(milliseconds: 650),
      );

      if (!mounted) {
        return;
      }

      _showMessage(
        '${document.title} is ready to be marked as verified in Firestore.',
      );
    } finally {
      if (mounted) {
        setState(() {
          _processingDocumentId = null;
        });
      }
    }
  }

  Future<void> _markDocumentInvalid(
    VerificationDocumentData document,
  ) async {
    final noteController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Row(
            children: [
              Icon(
                Icons.error_outline_rounded,
                color: Color(0xFFDC2626),
              ),
              SizedBox(width: 10),
              Expanded(
                child: Text('Mark document as invalid'),
              ),
            ],
          ),
          content: SizedBox(
            width: 480,
            child: Form(
              key: formKey,
              child: TextFormField(
                controller: noteController,
                minLines: 4,
                maxLines: 6,
                maxLength: 500,
                decoration: InputDecoration(
                  labelText: 'Reason',
                  hintText:
                      'Explain what is incorrect or what the provider must resubmit.',
                  alignLabelWithHint: true,
                  border: const OutlineInputBorder(),
                  helperText:
                      'This reason may be shown to the provider.',
                ),
                validator: (value) {
                  final reason = value?.trim() ?? '';

                  if (reason.isEmpty) {
                    return 'Enter a reason.';
                  }

                  if (reason.length < 10) {
                    return 'Provide a more detailed explanation.';
                  }

                  return null;
                },
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (!formKey.currentState!.validate()) {
                  return;
                }

                Navigator.of(dialogContext).pop(
                  noteController.text.trim(),
                );
              },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626),
              ),
              child: const Text('Mark invalid'),
            ),
          ],
        );
      },
    );

    noteController.dispose();

    if (reason == null || reason.isEmpty || !mounted) {
      return;
    }

    setState(() {
      _processingDocumentId = document.id;
    });

    try {
      await Future<void>.delayed(
        const Duration(milliseconds: 650),
      );

      if (!mounted) {
        return;
      }

      _showMessage(
        '${document.title} is ready to be marked invalid in Firestore.',
      );
    } finally {
      if (mounted) {
        setState(() {
          _processingDocumentId = null;
        });
      }
    }
  }

  final List<ProviderVerificationApplication> _applications = [
    ProviderVerificationApplication(
      id: 'PRV-2025-0001',
      providerId: 'provider_001',
      businessName: 'Fiesta Ormoc Catering',
      ownerName: 'Juan Dela Cruz',
      email: 'fiestaormoc@gmail.com',
      phone: '0912 345 6789',
      location: 'Ormoc City, Leyte',
      providerType: 'Catering Service',
      businessSince: '2021',
      submittedAt: 'Jan 3, 2025',
      status: VerificationApplicationStatus.pending,
      documents: [
        VerificationDocumentData(
          id: 'business_permit',
          title: 'Business Permit',
          fileName: 'business_permit.pdf',
          fileSize: '2.3 MB',
          fileUrl: 'https://example.com/business_permit.pdf',
          mimeType: 'application/pdf',
          uploadedAt: 'Jan 3, 2025 · 10:30 AM',
          reviewedAt: 'Jan 5, 2025 · 2:45 PM',
          reviewedBy: 'Admin User',
          status: VerificationDocumentStatus.verified,
        ),
        VerificationDocumentData(
          id: 'dti_registration',
          title: 'DTI Registration',
          fileName: 'dti_certificate.pdf',
          fileSize: '2.3 MB',
          status: VerificationDocumentStatus.verified,
        ),
        VerificationDocumentData(
          id: 'sanitary_permit',
          title: 'Sanitary Permit',
          fileName: 'sanitary_permit.pdf',
          fileSize: '2.3 MB',
          status: VerificationDocumentStatus.pending,
        ),
        VerificationDocumentData(
          id: 'bir_certificate',
          title: 'BIR Certificate',
          fileName: '',
          fileSize: '',
          isRequired: true,
          status: VerificationDocumentStatus.missing,
        ),
      ],
    ),
    ProviderVerificationApplication(
      id: 'PRV-2025-0002',
      providerId: 'provider_002',
      businessName: 'Casa Ormoc Kitchen',
      ownerName: 'Maria Santos',
      email: 'casaormockitchen@gmail.com',
      phone: '0917 456 7812',
      location: 'Ormoc City, Leyte',
      providerType: 'Catering Service',
      businessSince: '2020',
      submittedAt: 'Jan 5, 2025',
      status: VerificationApplicationStatus.pending,
      documents: [
        VerificationDocumentData(
          id: 'business_permit',
          title: 'Business Permit',
          fileName: 'permit.pdf',
          fileSize: '1.8 MB',
          status: VerificationDocumentStatus.pending,
        ),
        VerificationDocumentData(
          id: 'dti_registration',
          title: 'DTI Registration',
          fileName: 'dti_registration.pdf',
          fileSize: '2.0 MB',
          status: VerificationDocumentStatus.pending,
        ),
      ],
    ),
    ProviderVerificationApplication(
      id: 'PRV-2025-0003',
      providerId: 'provider_003',
      businessName: 'Luto Dabaw Catering',
      ownerName: 'Pedro Reyes',
      email: 'lutodabaw@gmail.com',
      phone: '0998 765 4321',
      location: 'Ormoc City, Leyte',
      providerType: 'Catering Service',
      businessSince: '2019',
      submittedAt: 'Jan 6, 2025',
      status: VerificationApplicationStatus.underReview,
      documents: [
        VerificationDocumentData(
          id: 'business_permit',
          title: 'Business Permit',
          fileName: 'business_permit.pdf',
          fileSize: '2.4 MB',
          status: VerificationDocumentStatus.verified,
        ),
        VerificationDocumentData(
          id: 'dti_registration',
          title: 'DTI Registration',
          fileName: 'dti.pdf',
          fileSize: '1.9 MB',
          status: VerificationDocumentStatus.verified,
        ),
      ],
    ),
    ProviderVerificationApplication(
      id: 'PRV-2025-0004',
      providerId: 'provider_004',
      businessName: 'Delicious Bites Catering',
      ownerName: 'Andrea Flores',
      email: 'deliciousbites@gmail.com',
      phone: '0915 321 9876',
      location: 'Ormoc City, Leyte',
      providerType: 'Catering Service',
      businessSince: '2022',
      submittedAt: 'Jan 7, 2025',
      status: VerificationApplicationStatus.pending,
      documents: [
        VerificationDocumentData(
          id: 'business_permit',
          title: 'Business Permit',
          fileName: 'permit.pdf',
          fileSize: '2.2 MB',
          status: VerificationDocumentStatus.pending,
        ),
      ],
    ),
    ProviderVerificationApplication(
      id: 'PRV-2025-0005',
      providerId: 'provider_005',
      businessName: 'Taste & Celebrate Events',
      ownerName: 'Carlo Mendoza',
      email: 'tastecelebrate@gmail.com',
      phone: '0926 845 7132',
      location: 'Ormoc City, Leyte',
      providerType: 'Catering and Event Services',
      businessSince: '2018',
      submittedAt: 'Jan 8, 2025',
      status: VerificationApplicationStatus.underReview,
      documents: [
        VerificationDocumentData(
          id: 'business_permit',
          title: 'Business Permit',
          fileName: 'business_permit.pdf',
          fileSize: '2.5 MB',
          status: VerificationDocumentStatus.verified,
        ),
      ],
    ),
    ProviderVerificationApplication(
      id: 'PRV-2025-0006',
      providerId: 'provider_006',
      businessName: 'Ormoc Premium Catering',
      ownerName: 'Elena Garcia',
      email: 'ormocpremium@gmail.com',
      phone: '0918 555 1212',
      location: 'Ormoc City, Leyte',
      providerType: 'Catering Service',
      businessSince: '2017',
      submittedAt: 'Jan 2, 2025',
      status: VerificationApplicationStatus.approved,
      documents: [
        VerificationDocumentData(
          id: 'business_permit',
          title: 'Business Permit',
          fileName: 'business_permit.pdf',
          fileSize: '2.0 MB',
          status: VerificationDocumentStatus.verified,
        ),
      ],
    ),
    ProviderVerificationApplication(
      id: 'PRV-2025-0007',
      providerId: 'provider_007',
      businessName: 'Leyte Celebration Services',
      ownerName: 'Miguel Navarro',
      email: 'leytecelebrations@gmail.com',
      phone: '0919 444 5678',
      location: 'Ormoc City, Leyte',
      providerType: 'Event Add-on Provider',
      businessSince: '2023',
      submittedAt: 'Jan 1, 2025',
      status: VerificationApplicationStatus.rejected,
      documents: [
        VerificationDocumentData(
          id: 'business_permit',
          title: 'Business Permit',
          fileName: 'expired_permit.pdf',
          fileSize: '1.4 MB',
          status: VerificationDocumentStatus.invalid,
        ),
      ],
    ),
  ];

  List<ProviderVerificationApplication> get _filteredApplications {
    final query = _searchController.text.trim().toLowerCase();

    return _applications.where((application) {
      final matchesFilter = switch (_selectedFilter) {
        VerificationFilter.all => true,
        VerificationFilter.pending =>
          application.status == VerificationApplicationStatus.pending,
        VerificationFilter.underReview =>
          application.status == VerificationApplicationStatus.underReview,
        VerificationFilter.approved =>
          application.status == VerificationApplicationStatus.approved,
        VerificationFilter.rejected =>
          application.status == VerificationApplicationStatus.rejected,
      };

      final matchesSearch = query.isEmpty ||
          application.businessName.toLowerCase().contains(query) ||
          application.ownerName.toLowerCase().contains(query) ||
          application.email.toLowerCase().contains(query) ||
          application.id.toLowerCase().contains(query);

      return matchesFilter && matchesSearch;
    }).toList();
  }

  ProviderVerificationApplication? get _selectedApplication {
    final filtered = _filteredApplications;

    if (filtered.isEmpty) {
      return null;
    }

    for (final application in filtered) {
      if (application.id == _selectedApplicationId) {
        return application;
      }
    }

    return filtered.first;
  }

  int _countByStatus(VerificationApplicationStatus status) {
    return _applications
        .where((application) => application.status == status)
        .length;
  }

  @override
  void initState() {
    super.initState();

    final pendingApplications = _applications.where(
      (application) =>
          application.status == VerificationApplicationStatus.pending,
    );

    if (pendingApplications.isNotEmpty) {
      _selectedApplicationId = pendingApplications.first.id;
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _changeFilter(VerificationFilter filter) {
    setState(() {
      _selectedFilter = filter;
      _selectedApplicationId = null;
    });
  }

  void _selectApplication(ProviderVerificationApplication application) {
    setState(() {
      _selectedApplicationId = application.id;
    });
  }

  void _showMobileDetails(
    BuildContext context,
    ProviderVerificationApplication application,
  ) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          backgroundColor: _pageBackgroundColor,
          appBar: AppBar(
            elevation: 0,
            scrolledUnderElevation: 0,
            backgroundColor: Colors.white,
            foregroundColor: _textColor,
            title: const Text(
              'Verification Details',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: _ProviderDetailsPanel(
                application: application,
                isProcessing: _isProcessingAction,
                processingDocumentId: _processingDocumentId,
                isSavingNotes:
                    _savingNotesApplicationId == application.id,
                onApprove: () => _showApproveDialog(application),
                onReject: () => _showRejectDialog(application),
                onViewProfile: () => _showMessage(
                  'Provider profile will be connected in the next phase.',
                ),
                onPreviewDocument: _previewDocument,
                onDownloadDocument: _downloadDocument,
                onVerifyDocument: _verifyDocument,
                onMarkDocumentInvalid: _markDocumentInvalid,
                onSaveNotes: (notes) => _saveAdminNotes(
                  application: application,
                  notes: notes,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showApproveDialog(
    ProviderVerificationApplication application,
  ) async {

    if (!application.canBeApproved) {
      _showMessage(
        'Verify all required documents before approving this provider.',
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Row(
            children: [
              Icon(
                Icons.verified_rounded,
                color: Color(0xFF16A34A),
              ),
              SizedBox(width: 10),
              Expanded(
                child: Text('Approve provider'),
              ),
            ],
          ),
          content: Text(
            'Approve ${application.businessName}? This is currently a UI-only action and will be connected to Firestore later.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF16A34A),
              ),
              child: const Text('Approve'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) {
      return;
    }

    setState(() {
      _isProcessingAction = true;
    });

    try {
      await Future<void>.delayed(
        const Duration(milliseconds: 700),
      );

      if (!mounted) {
        return;
      }

      _showMessage(
        '${application.businessName} is ready for the Firestore approval workflow.',
      );
    } finally {
      if (mounted) {
        setState(() {
          _isProcessingAction = false;
        });
      }
    }
  }

  Future<void> _showRejectDialog(
    ProviderVerificationApplication application,
  ) async {
    if (_isProcessingAction) {
      return;
    }

    final reason = await RejectProviderDialog.show(
      context: context,
      application: application,
    );

    if (reason == null || reason.trim().isEmpty || !mounted) {
      return;
    }

    setState(() {
      _isProcessingAction = true;
    });

    try {
      await Future<void>.delayed(
        const Duration(milliseconds: 700),
      );

      if (!mounted) {
        return;
      }

      _showMessage(
        '${application.businessName} is ready to be rejected with reason: $reason',
      );
    } finally {
      if (mounted) {
        setState(() {
          _isProcessingAction = false;
        });
      }
    }
  }

  void _showMessage(String message) {
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: _pageBackgroundColor,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isDesktop = constraints.maxWidth >= 1180;
          final isTablet = constraints.maxWidth >= 760;
          final filteredApplications = _filteredApplications;
          final selectedApplication = _selectedApplication;

          return Padding(
            padding: EdgeInsets.all(
              isDesktop
                  ? 24
                  : isTablet
                      ? 20
                      : 16,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(
                  isDesktop: isDesktop,
                  isTablet: isTablet,
                ),
                const SizedBox(height: 20),
                _buildSummaryCards(
                  isDesktop: isDesktop,
                  isTablet: isTablet,
                ),
                const SizedBox(height: 16),
                _buildToolbar(
                  isDesktop: isDesktop,
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: isDesktop
                      ? Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SizedBox(
                              width: 390,
                              child: ProviderVerificationList(
                                applications: filteredApplications,
                                selectedApplicationId: selectedApplication?.id,
                                selectedFilter: _selectedFilter,
                                onFilterChanged: _changeFilter,
                                onApplicationSelected: _selectApplication,
                                pageSize: 5,
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: selectedApplication == null
                                  ? const _VerificationEmptyState(
                                      title:
                                          'No application selected',
                                      message:
                                          'Select a provider application to review its information and documents.',
                                    )
                                  : SingleChildScrollView(
                                      child: _ProviderDetailsPanel(
                                        application: selectedApplication,
                                        isProcessing: _isProcessingAction,
                                        processingDocumentId: _processingDocumentId,
                                        isSavingNotes:
                                            _savingNotesApplicationId == selectedApplication.id,
                                        onApprove: () => _showApproveDialog(
                                          selectedApplication,
                                        ),
                                        onReject: () => _showRejectDialog(
                                          selectedApplication,
                                        ),
                                        onViewProfile: () => _showMessage(
                                          'Provider profile will be connected in the next phase.',
                                        ),
                                        onPreviewDocument: _previewDocument,
                                        onDownloadDocument: _downloadDocument,
                                        onVerifyDocument: _verifyDocument,
                                        onMarkDocumentInvalid: _markDocumentInvalid,
                                        onSaveNotes: (notes) => _saveAdminNotes(
                                          application: selectedApplication,
                                          notes: notes,
                                        ),
                                      ),
                                    ),
                            ),
                          ],
                        )
                      : ProviderVerificationList(
                        applications: filteredApplications,
                        selectedApplicationId: null,
                        selectedFilter: _selectedFilter,
                        onFilterChanged: _changeFilter,
                        onApplicationSelected: (application) {
                          _showMobileDetails(
                            context,
                            application,
                          );
                        },
                        pageSize: 6,
                      ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildHeader({
    required bool isDesktop,
    required bool isTablet,
  }) {
    final titleSection = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Provider Verification',
          style: TextStyle(
            fontSize: isDesktop ? 26 : 22,
            fontWeight: FontWeight.w800,
            color: _textColor,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(height: 5),
        const Text(
          'Review provider applications, validate documents, and manage approval decisions.',
          style: TextStyle(
            fontSize: 14,
            color: _secondaryTextColor,
            height: 1.4,
          ),
        ),
      ],
    );

    final pendingBadge = Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 13,
        vertical: 9,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7E0),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0xFFFDE7A5),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.hourglass_top_rounded,
            size: 17,
            color: Color(0xFFD97706),
          ),
          const SizedBox(width: 7),
          Text(
            '${_countByStatus(VerificationApplicationStatus.pending)} pending applications',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: Color(0xFFB45309),
            ),
          ),
        ],
      ),
    );

    if (isTablet) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: titleSection),
          const SizedBox(width: 20),
          pendingBadge,
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        titleSection,
        const SizedBox(height: 14),
        pendingBadge,
      ],
    );
  }

  Widget _buildSummaryCards({
    required bool isDesktop,
    required bool isTablet,
  }) {
    final cards = [
      _VerificationSummaryCard(
        title: 'Pending',
        value: _countByStatus(
          VerificationApplicationStatus.pending,
        ).toString(),
        icon: Icons.schedule_rounded,
        foregroundColor: const Color(0xFFD97706),
        backgroundColor: const Color(0xFFFFF7E0),
      ),
      _VerificationSummaryCard(
        title: 'Under Review',
        value: _countByStatus(
          VerificationApplicationStatus.underReview,
        ).toString(),
        icon: Icons.manage_search_rounded,
        foregroundColor: const Color(0xFF2563EB),
        backgroundColor: const Color(0xFFEFF6FF),
      ),
      _VerificationSummaryCard(
        title: 'Approved',
        value: _countByStatus(
          VerificationApplicationStatus.approved,
        ).toString(),
        icon: Icons.verified_rounded,
        foregroundColor: const Color(0xFF16A34A),
        backgroundColor: const Color(0xFFF0FDF4),
      ),
      _VerificationSummaryCard(
        title: 'Rejected',
        value: _countByStatus(
          VerificationApplicationStatus.rejected,
        ).toString(),
        icon: Icons.cancel_rounded,
        foregroundColor: const Color(0xFFDC2626),
        backgroundColor: const Color(0xFFFEF2F2),
      ),
    ];

    if (isDesktop) {
      return Row(
        children: [
          for (var index = 0; index < cards.length; index++) ...[
            Expanded(child: cards[index]),
            if (index != cards.length - 1)
              const SizedBox(width: 12),
          ],
        ],
      );
    }

    return GridView.count(
      crossAxisCount: isTablet ? 4 : 2,
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: isTablet ? 1.9 : 1.75,
      children: cards,
    );
  }

  Widget _buildToolbar({
    required bool isDesktop,
  }) {
    final searchField = TextField(
      controller: _searchController,
      onChanged: (_) {
        setState(() {
          _selectedApplicationId = null;
        });
      },
      decoration: InputDecoration(
        hintText: 'Search business, owner, email, or ID',
        hintStyle: const TextStyle(
          color: Color(0xFF9CA3AF),
          fontSize: 14,
        ),
        prefixIcon: const Icon(
          Icons.search_rounded,
          size: 21,
        ),
        suffixIcon: _searchController.text.trim().isNotEmpty
            ? IconButton(
                tooltip: 'Clear search',
                onPressed: () {
                  _searchController.clear();

                  setState(() {
                    _selectedApplicationId = null;
                  });
                },
                icon: const Icon(
                  Icons.close_rounded,
                  size: 19,
                ),
              )
            : null,
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: _borderColor,
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: _borderColor,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: _primaryColor,
            width: 1.4,
          ),
        ),
      ),
    );

    final sortButton = OutlinedButton.icon(
      onPressed: () {
        _showMessage(
          'Sorting will be connected when Firestore pagination is added.',
        );
      },
      icon: const Icon(
        Icons.swap_vert_rounded,
        size: 18,
      ),
      label: const Text('Newest first'),
      style: OutlinedButton.styleFrom(
        foregroundColor: _textColor,
        backgroundColor: Colors.white,
        side: const BorderSide(color: _borderColor),
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );

    if (isDesktop) {
      return Row(
        children: [
          Expanded(child: searchField),
          const SizedBox(width: 12),
          sortButton,
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        searchField,
        const SizedBox(height: 10),
        sortButton,
      ],
    );
  }
}




class _ProviderDetailsPanel extends StatelessWidget {
  final ProviderVerificationApplication application;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  final VoidCallback onViewProfile;
  final bool isProcessing;
  final String? processingDocumentId;
  final ValueChanged<VerificationDocumentData> onPreviewDocument;
  final ValueChanged<VerificationDocumentData> onDownloadDocument;
  final ValueChanged<VerificationDocumentData> onVerifyDocument;
  final ValueChanged<VerificationDocumentData> onMarkDocumentInvalid;
  final bool isSavingNotes;
  final ValueChanged<String> onSaveNotes;

  const _ProviderDetailsPanel({
    required this.application,
    required this.onApprove,
    required this.onReject,
    required this.onViewProfile,
    required this.isProcessing,
    required this.processingDocumentId,
    required this.onPreviewDocument,
    required this.onDownloadDocument,
    required this.onVerifyDocument,
    required this.onMarkDocumentInvalid,
    required this.isSavingNotes,
    required this.onSaveNotes,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.035),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProviderSummaryHeader(
            application: application,
            onApprove: onApprove,
            onReject: onReject,
            onViewProfile: onViewProfile,
            isProcessing: isProcessing,
          ),

          if (application.status ==
                  VerificationApplicationStatus.rejected &&
              application.rejectionReason?.trim().isNotEmpty == true) ...[
            const SizedBox(height: 14),
            _RejectionReasonBanner(
              reason: application.rejectionReason!,
              reviewedBy: application.reviewedBy,
              reviewedAt: application.reviewedAt,
            ),
          ],
          const SizedBox(height: 22),
          const Divider(height: 1),
          const SizedBox(height: 20),
          ProviderBusinessInfo(
            application: application,
          ),
          const SizedBox(height: 24),
          LayoutBuilder(
            builder: (context, constraints) {
              final useTwoColumns = constraints.maxWidth >= 760;

              if (useTwoColumns) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: SubmittedDocumentsCard(
                        documents: application.documents,
                        isProcessing: processingDocumentId != null,
                        onPreview: onPreviewDocument,
                        onDownload: onDownloadDocument,
                        onVerify: onVerifyDocument,
                        onMarkInvalid: onMarkDocumentInvalid,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: VerificationTimeline(
                        application: application,
                      ),
                    ),
                  ],
                );
              }

              return Column(
                children: [
                  SubmittedDocumentsCard(
                    documents: application.documents,
                    isProcessing: processingDocumentId != null,
                    onPreview: onPreviewDocument,
                    onDownload: onDownloadDocument,
                    onVerify: onVerifyDocument,
                    onMarkInvalid: onMarkDocumentInvalid,
                  ),
                  const SizedBox(height: 16),
                  VerificationTimeline(
                    application: application,
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          AdminNotesCard(
            key: ValueKey(application.id),
            initialNotes: application.adminNotes ?? '',
            isSaving: isSavingNotes,
            onSave: onSaveNotes,
          ),
          const SizedBox(height: 16),
          VerificationActivityHistory(
            application: application,
          ),
        ],
      ),
    );
  }
}
class _VerificationSummaryCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color foregroundColor;
  final Color backgroundColor;

  const _VerificationSummaryCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.foregroundColor,
    required this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 13,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: backgroundColor,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(
              icon,
              color: foregroundColor,
              size: 21,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: Color(0xFF6B7280),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RejectionReasonBanner extends StatelessWidget {
  final String reason;
  final String? reviewedBy;
  final String? reviewedAt;

  const _RejectionReasonBanner({
    required this.reason,
    this.reviewedBy,
    this.reviewedAt,
  });

  @override
  Widget build(BuildContext context) {
    final hasReviewMetadata =
        reviewedBy?.trim().isNotEmpty == true ||
        reviewedAt?.trim().isNotEmpty == true;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(
          color: const Color(0xFFFECACA),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.report_problem_outlined,
            color: Color(0xFFDC2626),
            size: 19,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Rejection Reason',
                  style: TextStyle(
                    color: Color(0xFFB91C1C),
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  reason,
                  style: const TextStyle(
                    color: Color(0xFF991B1B),
                    fontSize: 12,
                    height: 1.45,
                  ),
                ),
                if (hasReviewMetadata) ...[
                  const SizedBox(height: 7),
                  Text(
                    [
                      if (reviewedBy?.trim().isNotEmpty == true)
                        'Reviewed by $reviewedBy',
                      if (reviewedAt?.trim().isNotEmpty == true)
                        reviewedAt!,
                    ].join(' · '),
                    style: const TextStyle(
                      color: Color(0xFFB91C1C),
                      fontSize: 10.5,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _VerificationEmptyState extends StatelessWidget {
  final String title;
  final String message;
  final bool compact;

  const _VerificationEmptyState({
    required this.title,
    required this.message,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(compact ? 24 : 40),
      decoration: compact
          ? null
          : BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: const Color(0xFFE5E7EB),
              ),
            ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: compact ? 58 : 72,
              height: compact ? 58 : 72,
              decoration: BoxDecoration(
                color: const Color(0xFFFFF1EC),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(
                Icons.fact_check_outlined,
                color: const Color(0xFFFF6333),
                size: compact ? 28 : 34,
              ),
            ),
            const SizedBox(height: 15),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: Color(0xFF1F2937),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                height: 1.5,
                color: Color(0xFF6B7280),
              ),
            ),
          ],
        ),
      ),
    );
  }
}