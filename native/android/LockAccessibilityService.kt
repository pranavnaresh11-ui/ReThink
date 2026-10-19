package app.exhale.lock

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

/**
 * Android counterpart of the iOS Screen Time shield. Reacts to foreground-window changes
 * (no polling needed), and if a locked app comes up during a lock, sends the user home and
 * shows the lock screen.
 */
class LockAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return

        val prefs = getSharedPreferences(LockStore.PREFS, Context.MODE_PRIVATE)
        val lockEnd = prefs.getLong(LockStore.LOCK_END, 0L)
        if (System.currentTimeMillis() >= lockEnd) return
        val locked = prefs.getStringSet(LockStore.LOCKED_PACKAGES, emptySet()).orEmpty()
        if (pkg !in locked) return

        performGlobalAction(GLOBAL_ACTION_HOME)
        startActivity(
            Intent(this, LockActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(LockActivity.EXTRA_BLOCKED_PACKAGE, pkg),
        )
    }

    override fun onInterrupt() = Unit
}

/** Written by the app when the user logs a slip or earns time back. */
object LockStore {
    const val PREFS = "exhale_lock"
    const val LOCK_END = "lock_end"
    const val LOCKED_PACKAGES = "locked_packages"

    fun startLock(context: Context, minutes: Int, packages: Set<String>) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(LOCK_END, System.currentTimeMillis() + minutes * 60_000L)
            .putStringSet(LOCKED_PACKAGES, packages)
            .apply()
    }

    fun reduceLock(context: Context, minutes: Int) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val end = prefs.getLong(LOCK_END, 0L)
        if (end > 0) prefs.edit().putLong(LOCK_END, end - minutes * 60_000L).apply()
    }
}
