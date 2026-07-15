enum VerificationFilter {
  all,
  pending,
  underReview,
  approved,
  rejected,
}

extension VerificationFilterLabel on VerificationFilter {
  String get label {
    return switch (this) {
      VerificationFilter.all => 'All',
      VerificationFilter.pending => 'Pending',
      VerificationFilter.underReview => 'Under Review',
      VerificationFilter.approved => 'Approved',
      VerificationFilter.rejected => 'Rejected',
    };
  }
}

enum VerificationApplicationStatus {
  pending,
  underReview,
  approved,
  rejected,
}

enum VerificationDocumentStatus {
  pending,
  verified,
  invalid,
  missing,
}

class ProviderVerificationApplication {
  final String id;
  final String providerId;
  final String businessName;
  final String ownerName;
  final String email;
  final String phone;
  final String location;
  final String providerType;
  final String businessSince;
  final String submittedAt;
  final VerificationApplicationStatus status;
  final List<VerificationDocumentData> documents;
  final List<VerificationTimelineEntry> timeline;
  final List<VerificationActivity> activities;
  final String? adminNotes;
  final String? rejectionReason;
  final String? reviewedBy;
  final String? reviewedAt;

  const ProviderVerificationApplication({
    required this.id,
    required this.providerId,
    required this.businessName,
    required this.ownerName,
    required this.email,
    required this.phone,
    required this.location,
    required this.providerType,
    required this.businessSince,
    required this.submittedAt,
    required this.status,
    required this.documents,
    this.timeline = const [],
    this.activities = const [],
    this.adminNotes,
    this.rejectionReason,
    this.reviewedBy,
    this.reviewedAt,
  });

  ProviderVerificationApplication copyWith({
    String? id,
    String? providerId,
    String? businessName,
    String? ownerName,
    String? email,
    String? phone,
    String? location,
    String? providerType,
    String? businessSince,
    String? submittedAt,
    VerificationApplicationStatus? status,
    List<VerificationDocumentData>? documents,
    List<VerificationTimelineEntry>? timeline,
    List<VerificationActivity>? activities,
    String? adminNotes,
    String? rejectionReason,
    String? reviewedBy,
    String? reviewedAt,
  }) {
    return ProviderVerificationApplication(
      id: id ?? this.id,
      providerId: providerId ?? this.providerId,
      businessName: businessName ?? this.businessName,
      ownerName: ownerName ?? this.ownerName,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      location: location ?? this.location,
      providerType: providerType ?? this.providerType,
      businessSince: businessSince ?? this.businessSince,
      submittedAt: submittedAt ?? this.submittedAt,
      status: status ?? this.status,
      documents: documents ?? this.documents,
      timeline: timeline ?? this.timeline,
      activities: activities ?? this.activities,
      adminNotes: adminNotes ?? this.adminNotes,
      rejectionReason: rejectionReason ?? this.rejectionReason,
      reviewedBy: reviewedBy ?? this.reviewedBy,
      reviewedAt: reviewedAt ?? this.reviewedAt,
    );
  }

  bool get canBeApproved {
    final requiredDocuments = documents.where(
      (document) => document.isRequired,
    );

    if (requiredDocuments.isEmpty) {
      return false;
    }

    return requiredDocuments.every(
      (document) =>
          document.status ==
          VerificationDocumentStatus.verified,
    );
  }
}

class VerificationDocumentData {
  final String id;
  final String title;
  final String fileName;
  final String fileSize;
  final String? fileUrl;
  final String? mimeType;
  final String? reviewNote;
  final String? uploadedAt;
  final String? reviewedAt;
  final String? reviewedBy;
  final bool isRequired;
  final VerificationDocumentStatus status;

  const VerificationDocumentData({
    required this.id,
    required this.title,
    required this.fileName,
    required this.fileSize,
    required this.status,
    this.fileUrl,
    this.mimeType,
    this.reviewNote,
    this.uploadedAt,
    this.reviewedAt,
    this.reviewedBy,
    this.isRequired = true,
  });

  VerificationDocumentData copyWith({
    String? id,
    String? title,
    String? fileName,
    String? fileSize,
    String? fileUrl,
    String? mimeType,
    String? reviewNote,
    String? uploadedAt,
    String? reviewedAt,
    String? reviewedBy,
    bool? isRequired,
    VerificationDocumentStatus? status,
  }) {
    return VerificationDocumentData(
      id: id ?? this.id,
      title: title ?? this.title,
      fileName: fileName ?? this.fileName,
      fileSize: fileSize ?? this.fileSize,
      fileUrl: fileUrl ?? this.fileUrl,
      mimeType: mimeType ?? this.mimeType,
      reviewNote: reviewNote ?? this.reviewNote,
      uploadedAt: uploadedAt ?? this.uploadedAt,
      reviewedAt: reviewedAt ?? this.reviewedAt,
      reviewedBy: reviewedBy ?? this.reviewedBy,
      isRequired: isRequired ?? this.isRequired,
      status: status ?? this.status,
    );
  }
}

enum VerificationTimelineStatus {
  completed,
  inProgress,
  pending,
  failed,
}

enum VerificationActivityType {
  applicationSubmitted,
  reviewStarted,
  documentVerified,
  documentInvalid,
  noteUpdated,
  approved,
  rejected,
  providerNotified,
}

class VerificationTimelineEntry {
  final String id;
  final String title;
  final String description;
  final VerificationTimelineStatus status;
  final String? timestamp;
  final String? adminName;

  const VerificationTimelineEntry({
    required this.id,
    required this.title,
    required this.description,
    required this.status,
    this.timestamp,
    this.adminName,
  });
}

class VerificationActivity {
  final String id;
  final VerificationActivityType type;
  final String title;
  final String description;
  final String timestamp;
  final String? actorName;

  const VerificationActivity({
    required this.id,
    required this.type,
    required this.title,
    required this.description,
    required this.timestamp,
    this.actorName,
  });
}