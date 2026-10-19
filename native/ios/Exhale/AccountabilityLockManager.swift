import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

// Shared between the app and its extensions (Monitor + Shield) via the App Group.
enum LockShared {
    static let appGroup = "group.app.exhale"
    static let lockEndKey = "lockEnd"
    static let selectionKey = "lockSelection"
    static var defaults: UserDefaults { UserDefaults(suiteName: appGroup)! }
}

extension DeviceActivityName {
    static let relapseCooldown = Self("relapseCooldown")
}

extension ManagedSettingsStore.Name {
    static let relapseLock = Self("relapseLock")
}

/// Applies and lifts the OS-level app shield when the user logs nicotine use.
@MainActor
final class AccountabilityLockManager: ObservableObject {
    static let shared = AccountabilityLockManager()

    /// DeviceActivity rejects schedules shorter than this (MonitoringError.intervalTooShort).
    private static let minimumInterval: TimeInterval = 15 * 60

    private let store = ManagedSettingsStore(named: .relapseLock)
    private let center = DeviceActivityCenter()

    @Published var selection = FamilyActivitySelection()

    init() {
        if let data = LockShared.defaults.data(forKey: LockShared.selectionKey),
           let saved = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) {
            selection = saved
        }
    }

    /// Call once during onboarding. `.individual` lets a teen authorize their own device (iOS 16+).
    func requestAuthorization() async throws {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
    }

    /// Persist what the user picked in FamilyActivityPicker. Tokens are opaque: we never learn which apps they are.
    func saveSelection(_ newSelection: FamilyActivitySelection) {
        selection = newSelection
        if let data = try? JSONEncoder().encode(newSelection) {
            LockShared.defaults.set(data, forKey: LockShared.selectionKey)
        }
    }

    /// "I vaped" or a missed honesty check-in.
    func startLock(minutes: Int) throws {
        // 1. Shield immediately. The store persists across app kills and reboots.
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? nil
            : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens

        // 2. Ask the system to wake our Monitor extension when the cooldown ends.
        try scheduleUnlock(at: Date().addingTimeInterval(TimeInterval(minutes * 60)))
    }

    /// Breathing exercise or trigger reflection completed: pull the end time in.
    func reduceLock(byMinutes minutes: Int) throws {
        guard let end = currentLockEnd else { return }
        let newEnd = end.addingTimeInterval(TimeInterval(-minutes * 60))
        if newEnd <= Date() {
            endLock()
        } else {
            try scheduleUnlock(at: newEnd)
        }
    }

    func endLock() {
        center.stopMonitoring([.relapseCooldown])
        store.clearAllSettings()
        LockShared.defaults.removeObject(forKey: LockShared.lockEndKey)
    }

    var currentLockEnd: Date? {
        let t = LockShared.defaults.double(forKey: LockShared.lockEndKey)
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }

    /// Safety net for the app's own launch / BGAppRefreshTask, in case the extension didn't run.
    func clearIfExpired() {
        if let end = currentLockEnd, end <= Date() { endLock() }
    }

    private func scheduleUnlock(at end: Date) throws {
        LockShared.defaults.set(end.timeIntervalSince1970, forKey: LockShared.lockEndKey)
        center.stopMonitoring([.relapseCooldown])

        // Short remaining times would be rejected, so back-date the start to keep the
        // interval at 15 minutes. Verify this on a device for your iOS version.
        let start = min(Date(), end.addingTimeInterval(-Self.minimumInterval))

        // Full date components (not just hour/minute) so a lock that crosses midnight still works.
        let parts: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let schedule = DeviceActivitySchedule(
            intervalStart: Calendar.current.dateComponents(parts, from: start),
            intervalEnd: Calendar.current.dateComponents(parts, from: end),
            repeats: false
        )
        try center.startMonitoring(.relapseCooldown, during: schedule)
    }
}
