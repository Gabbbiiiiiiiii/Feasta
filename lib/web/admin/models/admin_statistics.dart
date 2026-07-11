class AdminStatistics {
  final int totalAccounts;
  final int totalCustomers;
  final int totalProviders;
  final int totalAdministrators;

  final int verifiedProviders;
  final int pendingVerifications;
  final int rejectedVerifications;

  final int disabledAccounts;
  final int blockedAccounts;

  const AdminStatistics({
    required this.totalAccounts,
    required this.totalCustomers,
    required this.totalProviders,
    required this.totalAdministrators,
    required this.verifiedProviders,
    required this.pendingVerifications,
    required this.rejectedVerifications,
    required this.disabledAccounts,
    required this.blockedAccounts,
  });

  const AdminStatistics.empty()
      : totalAccounts = 0,
        totalCustomers = 0,
        totalProviders = 0,
        totalAdministrators = 0,
        verifiedProviders = 0,
        pendingVerifications = 0,
        rejectedVerifications = 0,
        disabledAccounts = 0,
        blockedAccounts = 0;

  int get disabledOrBlockedAccounts {
    return disabledAccounts + blockedAccounts;
  }

  double get verifiedProviderPercentage {
    if (totalProviders == 0) return 0;
    return (verifiedProviders / totalProviders) * 100;
  }

  double get pendingVerificationPercentage {
    if (totalProviders == 0) return 0;
    return (pendingVerifications / totalProviders) * 100;
  }

  double get restrictedAccountPercentage {
    if (totalAccounts == 0) return 0;
    return (disabledOrBlockedAccounts / totalAccounts) * 100;
  }
}