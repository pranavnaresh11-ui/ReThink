import DeviceActivity
import Foundation
import ManagedSettings

// Device Activity Monitor extension target. The system runs this even when the app
// is closed, so the lock lifts on time without Exhale being open.
//
// Needs the same `LockShared`, `DeviceActivityName.relapseCooldown` and
// `ManagedSettingsStore.Name.relapseLock` definitions as the app (add
// AccountabilityLockManager.swift's top section to this target, or a shared framework).
final class ExhaleMonitorExtension: DeviceActivityMonitor {
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        guard activity == .relapseCooldown else { return }

        // Rescheduling (lock reductions) stops the old schedule. Only clear the shield
        // if the lock is really over, not because an outdated schedule ended.
        let end = LockShared.defaults.double(forKey: LockShared.lockEndKey)
        guard end == 0 || Date().timeIntervalSince1970 >= end - 30 else { return }

        ManagedSettingsStore(named: .relapseLock).clearAllSettings()
        LockShared.defaults.removeObject(forKey: LockShared.lockEndKey)
    }
}
