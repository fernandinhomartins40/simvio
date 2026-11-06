package app.simvio.receptor

import android.app.Application
import app.simvio.receptor.data.SecureStore
import app.simvio.receptor.work.Work

class SimvioApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (SecureStore.get(this).isPaired) {
            Work.scheduleHeartbeat(this)
            // Se havia eventos pendentes quando o processo morreu, retoma o envio.
            if (SecureStore.get(this).pending().isNotEmpty()) Work.enqueueDelivery(this)
        }
    }
}
