import Foundation
import ManagedSettings
import ManagedSettingsUI
import UIKit

// Shield Configuration extension target. iOS asks this for the screen it draws over a
// blocked app. It runs sandboxed: it can read the App Group, but can't open Exhale.
final class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    override func configuration(shielding application: Application) -> ShieldConfiguration {
        makeConfiguration(appName: application.localizedDisplayName)
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        makeConfiguration(appName: application.localizedDisplayName)
    }

    private func makeConfiguration(appName: String?) -> ShieldConfiguration {
        let end = UserDefaults(suiteName: "group.app.exhale")?.double(forKey: "lockEnd") ?? 0
        let minutes = max(1, Int(ceil((end - Date().timeIntervalSince1970) / 60)))
        let coral = UIColor(red: 1.0, green: 0.54, blue: 0.48, alpha: 1)

        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: UIColor(red: 0.02, green: 0.06, blue: 0.10, alpha: 0.92),
            icon: UIImage(systemName: "lungs.fill"),
            title: ShieldConfiguration.Label(text: "Nicotine reset active", color: .white),
            subtitle: ShieldConfiguration.Label(
                text: "\(appName ?? "This app") is paused for \(minutes) more min while your body clears nicotine. Take 5 slow breaths instead.",
                color: UIColor(white: 0.8, alpha: 1)
            ),
            primaryButtonLabel: ShieldConfiguration.Label(text: "OK", color: .black),
            primaryButtonBackgroundColor: coral
        )
    }
}
