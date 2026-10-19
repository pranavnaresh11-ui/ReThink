package app.exhale.lock

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.os.CountDownTimer
import android.view.Gravity
import android.widget.TextView

/** Full-screen "Nicotine reset active" screen shown over a blocked app. */
class LockActivity : Activity() {
    private var timer: CountDownTimer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val label = TextView(this).apply {
            gravity = Gravity.CENTER
            textSize = 20f
            setPadding(64, 64, 64, 64)
        }
        setContentView(label)

        val end = getSharedPreferences(LockStore.PREFS, Context.MODE_PRIVATE).getLong(LockStore.LOCK_END, 0L)
        timer = object : CountDownTimer(maxOf(0L, end - System.currentTimeMillis()), 1_000L) {
            override fun onTick(ms: Long) {
                val s = ms / 1000
                label.text = "Nicotine reset active\n\n%d:%02d remaining\n\nYour body is clearing nicotine.\nTake 5 slow breaths instead."
                    .format(s / 60, s % 60)
            }
            override fun onFinish() = finish()
        }.start()
    }

    override fun onDestroy() {
        timer?.cancel()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_BLOCKED_PACKAGE = "blocked_package"
    }
}
