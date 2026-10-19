import FamilyControls
import SwiftUI

/// Onboarding step: authorize Screen Time and pick the apps to hold hostage.
struct LockSetupView: View {
    @ObservedObject private var lock = AccountabilityLockManager.shared
    @State private var pickerShown = false
    @State private var draft = FamilyActivitySelection()
    @State private var error: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("Make the pact").font(.title.bold())
            Text("If you log nicotine use, the apps you pick lock for 30 minutes. Calls and texts always work.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Button("Choose apps to lock") {
                Task {
                    do {
                        try await lock.requestAuthorization()
                        draft = lock.selection
                        pickerShown = true
                    } catch {
                        self.error = "Screen Time permission is needed for the lock."
                    }
                }
            }
            .buttonStyle(.borderedProminent)

            Text("\(lock.selection.applicationTokens.count) apps, \(lock.selection.categoryTokens.count) categories selected")
                .font(.footnote)
                .foregroundStyle(.secondary)

            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
        }
        .padding()
        .familyActivityPicker(isPresented: $pickerShown, selection: $draft)
        // Single-argument form so this still builds for iOS 16.
        .onChange(of: draft) { newValue in lock.saveSelection(newValue) }
    }
}
