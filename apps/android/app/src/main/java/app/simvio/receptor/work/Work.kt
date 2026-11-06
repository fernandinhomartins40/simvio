package app.simvio.receptor.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.simvio.receptor.data.ApiClient
import app.simvio.receptor.data.Diagnostics
import app.simvio.receptor.data.DrainResult
import app.simvio.receptor.data.EventSender
import app.simvio.receptor.data.RevokedException
import app.simvio.receptor.data.SecureStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

object Work {
    private const val DELIVERY = "simvio-delivery"
    private const val HEARTBEAT = "simvio-heartbeat"

    private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Reenvio persistente da fila; sobrevive a reinício do app/aparelho. */
    fun enqueueDelivery(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<DeliveryWorker>()
            .setConstraints(network)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(DELIVERY, ExistingWorkPolicy.KEEP, req)
    }

    /** Heartbeat de melhor esforço: o mínimo do Android para trabalho periódico é 15 minutos. */
    fun scheduleHeartbeat(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES)
            .setConstraints(network)
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(HEARTBEAT, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    fun cancelAll(ctx: Context) {
        WorkManager.getInstance(ctx).cancelUniqueWork(DELIVERY)
        WorkManager.getInstance(ctx).cancelUniqueWork(HEARTBEAT)
    }
}

class DeliveryWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        when (EventSender.drain(applicationContext)) {
            DrainResult.RETRY_LATER -> Result.retry()
            else -> Result.success()
        }
    }
}

class HeartbeatWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        val store = SecureStore.get(ctx)
        val base = store.apiBase ?: return@withContext Result.success()
        val cred = store.credential ?: return@withContext Result.success()
        try {
            EventSender.drain(ctx)
            ApiClient(base, cred).heartbeat(Diagnostics.appVersion, Diagnostics.snapshot(ctx).toJson())
            store.lastContactAt = System.currentTimeMillis()
            Result.success()
        } catch (e: RevokedException) {
            EventSender.handleRevoked(ctx)
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
